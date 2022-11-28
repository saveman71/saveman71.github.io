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
