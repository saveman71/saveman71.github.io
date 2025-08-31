---
layout: post
title:  "HFS+ boot partition read only and unbootable"
date:   2022-11-28 16:42:42 +0200
categories: mac arch boot
---

# Intro

A few weeks ago I set up a local server to manage my 3d printer and home assistant instance with an old mac system. In order for the mac to boot properly, I needed to use HFS+ for the /boot partition. I used this excellent tutorial to do that: https://heeris.id.au/2014/ubuntu-plus-mac-pure-efi-boot/.

However today, after upgrading the kernel (this will matter later) and rebooting, I was left with this rather cryptic message:

```
Starting systend-udevd version 252.1-2-arch
[FAILED] Failed to mount /boot.
[DEPEND] Dependency failed for Local File Systems. You are in emergency mode. After logging in, type "journalctl -xb" to view
system logs, "systemctl reboot" to reboot, "systemctl default" or "exit"
to boot into default node.
Give root password for maintenance
(or press Control-D to continue):
```

My USB keyboard wasn't recognized as well so I couldn't investigate just from that. I had to use my live media and chroot in the system.

# Chrooting

So I mount `/` and `/boot` and chroot inside. Initially everything seemed fine, but trying to run `mkinitcpio` was outputing errors that seemed to tell that something was off with the `/boot` partition. Some forum posts were telling "your boot partition isn't mounted", and I was like "but I just did". More investigation was needed. Maybe I was just using `mkinitcpio` wrong. Let's just try `pacman -S linux` because the hooks should run everything again anyway.

```
# sudo pacman -S linux
warning: linux-6.0.10.arch2-1 is up to date -- reinstalling
resolving dependencies...
looking for conflicting packages...

Packages (1) linux-6.0.10.arch2-1

Total Installed Size:  163.63 MiB
Net Upgrade Size:        0.00 MiB

:: Proceed with installation? [Y/n]
(1/1) checking keys in keyring        [##################] 100%
(1/1) checking package integrity      [##################] 100%
(1/1) loading package files           [##################] 100%
(1/1) checking for file conflicts     [##################] 100%
(1/1) checking available disk space   [##################] 100%
:: Processing package changes...
(1/1) reinstalling linux              [##################] 100%
:: Running post-transaction hooks...
(1/3) Arming ConditionNeedsUpdate...
(2/3) Updating module dependencies...
(3/3) Updating linux initcpios...
install: cannot remove '/boot/vmlinuz-linux': Read-only file system
error: command failed to execute correctly
```

Ah. `Read-only file system`! That's means in the previous update (the one I'm talking of at the beginning) never updated the files in the `/boot` partition, causing the system be unbootable. Now we know where to investigate. Tring to remount with `-remount,rw` doesn't seem to work. Still readonly. Let's check `dmesg`.

```
hfsplus: Filesystem was not cleanly unmounted, running fsck.hfsplus is recommended.  mounting read-only.
```

Ah! Okay. So that's the downside of having a proper EFI mac booting linux. It will mount your `/boot` read only without telling you. Okay, fair, the initial update of `linux` failed and I should have investigated at that time and not reboot into an unbootable state.

Running `fsck.hfsplus` and remounting allowed me to update the kernel again and properly finalize the update. Then the system was bootable!

# Preventing future issues

So this system is at high risk of being unplugged (it's just lying out in my living room, etc.) and that's actually exactly what happened in the first place. So if every time it's unplugged the `/boot` partition becomes read-only and prevents future updates, that's annoying.

Hopefully, we should be able to prevent that by running `fsck` on each boot. That way the filesystem should never be mounted read-only.

We can do this by adding the `fsck.mode=force` kernel parameter.

Also, next time, actually checking the update ran successfully before rebooting will help ;)

# Update 2025-08-31: It happened again!

Three years later, and I hit the same issue during a system update. This time I saw the update fail, and thought I could fix it by running `fsck.hfsplus` and remounting the partition. Let me walk you through what happened:

```
:: Running pre-transaction hooks...
(1/3) etckeeper: pre-transaction commit
[master af46571] saving uncommitted changes in /etc prior to pacman run
 5 files changed, 3 insertions(+), 1 deletion(-)
(2/3) Removing linux initcpios...
rm: cannot remove '/boot/initramfs-linux-fallback.img': Read-only file system
rm: cannot remove '/boot/initramfs-linux.img': Read-only file system
rm: cannot remove '/boot/vmlinuz-linux': Read-only file system
error: command failed to execute correctly
(3/3) Remove DKMS modules
==> dkms remove --no-depmod broadcom-wl/6.30.223.271 -k 6.15.6-zen1-1-zen
==> dkms remove --no-depmod broadcom-wl/6.30.223.271 -k 6.15.6-arch1-1
==> depmod 6.15.6-zen1-1-zen
==> depmod 6.15.6-arch1-1
```

Let's check:

```
❯ grep "[[:space:]]ro[[:space:],]" /proc/mounts
/dev/sda1 /boot hfsplus ro,relatime,umask=22,uid=0,gid=0,nls=utf8 0 0
```

Indeed, `/boot` is read-only. Let's try remounting it read-write:

```
❯ sudo mount -o remount,rw /boot
❯ grep "[[:space:]]ro[[:space:],]" /proc/mounts
/dev/sda1 /boot hfsplus ro,relatime,umask=22,uid=0,gid=0,nls=utf8 0 0
```

Still read-only? Indeed we can see this in the dmesg output (which didn't contain anything related to hfs prior to the mount command):

```
❯ sudo dmesg | grep hfs
[2686028.481168] hfsplus: filesystem was not cleanly unmounted, running fsck.hfsplus is recommended.  leaving read-only.
```

Seems like the same issue as last time. Let's run `fsck.hfsplus`:
```
❯ sudo fsck.hfsplus /dev/sda1
** /dev/sda1
   Executing fsck_hfs (version 540.1-Linux).
** Checking non-journaled HFS Plus Volume.
   The volume name is Arch Linux
** Checking extents overflow file.
** Checking catalog file.
** Checking multi-linked files.
** Checking catalog hierarchy.
** Checking extended attributes file.
** Checking volume bitmap.
** Checking volume information.
** The volume Arch Linux appears to be OK.
```

Now let's try remounting again:

```
❯ sudo mount -o remount,rw /boot
❯ grep "[[:space:]]ro[[:space:],]" /proc/mounts
/dev/sda1 /boot hfsplus ro,relatime,umask=22,uid=0,gid=0,nls=utf8 0 0
```

Still read-only! And the kernel log keeps saying the same thing:

```
❯ sudo dmesg | grep hfs
[2686028.481168] hfsplus: filesystem was not cleanly unmounted, running fsck.hfsplus is recommended.  leaving read-only.
[2686273.749134] hfsplus: filesystem was not cleanly unmounted, running fsck.hfsplus is recommended.  leaving read-only.
```

At this point I tried the force flag too but it didn't find any issues either. I found [a thread on the Arch forums](https://bbs.archlinux.org/viewtopic.php?id=227493) that unmounts first, then remounts:

```
❯ sudo umount /boot
❯ sudo mount -t hfsplus -o force,rw /dev/sda1 /boot
mount: /boot: WARNING: source write-protected, mounted read-only.
```

Still no luck!

I'm running out of options, so I decided to try downgrading to the old kernel I had in the cache to be able to reboot:

```
❯ sudo pacman -U /var/cache/pacman/pkg/linux-6.15.6.arch1-1-x86_64.pkg.tar.zst
loading packages...
warning: downgrading package linux (6.16.4.arch1-1 => 6.15.6.arch1-1)
resolving dependencies...
looking for conflicting packages...

Packages (1) linux-6.15.6.arch1-1

Total Installed Size:  141.35 MiB
Net Upgrade Size:       -1.28 MiB

:: Proceed with installation? [Y/n]
(1/1) checking keys in keyring            [#########################] 100%
(1/1) checking package integrity          [#########################] 100%
(1/1) loading package files               [#########################] 100%
(1/1) checking for file conflicts         [#########################] 100%
(1/1) checking available disk space       [#########################] 100%
:: Running pre-transaction hooks...
(1/2) Removing linux initcpios...
rm: cannot remove '/boot/initramfs-linux-fallback.img': Read-only file system
rm: cannot remove '/boot/initramfs-linux.img': Read-only file system
rm: cannot remove '/boot/vmlinuz-linux': Read-only file system
error: command failed to execute correctly
```

Still hitting the read-only issue but at this point the initramfs should match.

Sadly after rebooting, the Mac wasn't showing up on the network. I connected a screen (after grumbling my way to the office) and sadly took notice that it's actually booting with `linux-zen` by default, not the regular `linux` kernel!

I selected the regular `linux` kernel from GRUB's advanced boot menu, and the system booted properly. And to my surprise, when I checked the file system:

```
❯ grep "[[:space:]]ro[[:space:],]" /proc/mounts
```

No more read-only `/boot`! It was now mounted read-write. I'm not sure why a simple reboot fixed it when `fsck` didn't, but I'll take it.

I completed the upgrade by reinstalling `linux-zen` and `linux` (which I downgraded earlier):

```
❯ sudo pacman -S linux-zen linux
warning: linux-zen-6.16.4.zen1-1 is up to date -- reinstalling
```

After the reinstall completed successfully and all the initramfs files were correctly generated, another reboot got me back to the usual `linux-zen` kernel.

So, a few takeaways:
1. The `fsck.mode=force` kernel parameter I added earlier clearly didn't fully solve the issue, and I have no logs to explain why.
2. Sometimes a reboot is still needed, even after running fsck manually
3. Having multiple kernels installed is a lifesaver if they're not updated at the same time (but you still need a keyboard/screen to select it)
