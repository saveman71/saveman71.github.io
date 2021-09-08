---
layout: post
title:  "Installing Arch Linux with rsync"
date:   2021-09-08 11:19:42 +0100
categories: linux archlinux rsync
---

So you change laptops. This stuff happens, as tech upgrade, as you change jobs, etc. But you want to keep at most everything in place, your configs, your files, etc. Everything.

If you follow the excellently written Arch wiki, you get a clean, empty install. It's a long process that'll take a few hours and is interesting to do at least once. For me, I did it about 6 years ago, but no, thank you, I'll pass doing it all again. I have a "stable" install that works and I don't see the point starting from scratch. If it ain't broke don't fix it.

The current system is LUKS + LVM + EXT4, with 2 subvolumes (/ and /home).
I want the new system to be LUKS + BTRFS, again with 2 subvolumes.

If I had kept the same file system / same structure, I could have just used Clonezilla (In fact, that's what I have done a few years ago when I joined at La Belle Assiette: I just cloned my personal laptop to my new one).

But since the file systems are different, we need to go another route. It seems like it could be possible to clone the ext4 file systems and then use BTRFS's conversion feature, but I liked the idea of doing _this part_ from scratch.

Here's the list of tasks / things I've done:

**Note:** they're not so detailed/complete, that's just a personal blog and content I might use later as a reference, YMMV.

* Cleanup the source system: package cache, Spotify cache, browser cache, etc. That will speed up the transfer.
* Create a arch live ISO
* Disable secure boot on the new laptop
* Boot the live ISO (choose the option to boot in RAM, that will protect you from having issues if the USB key gets accidentally unplugged, or say if your laptop only has 1 USB Type A port, and you need it for other matters later (looking at you ASUS))
* Create the partitions
    - 1 partition of 256M for /boot (unencrypted, or that slows Grub by approx 30s and is not so useful, correct me if I'm wrong)
    - 1 partition of 500G for the BTRFS filesystem (nice [RAS syndrome](https://english.stackexchange.com/a/426489/339347))
    - The left of the disk to a future, Windows partition
* Create the encrypted partition
    - `cryptsetup luksFormat /dev/nvme0n1p2`
    - `cryptsetup open /dev/nvme0n1p2 cryptroot` opens the partition as `/dev/mapper/cryptroot`
* Format the disk
    - `mkfs.fat /dev/nvme0n1p1` for the boot one
    - Temporarily mount the root BTRFS partition: `mount -t btrfs /dev/mapper/cryptroot /mnt`
    - Create the subvolumes

        ```
        btrfs subvolume create /mnt/@
        btrfs subvolume create /mnt/@home
        btrfs subvolume create /mnt/@snapshots
        ```
    
    - Unmount and remount with the corect partitions (this part is taken from [this gist](https://gist.github.com/ansulev/7cdf38a3d387599adf9addd248b09db8), which is probably also inspired from somewhere else, I'm not claiming any copyright)
    
        ```
        umount /mnt

        # Mount options
        o=defaults,x-mount.mkdir
        o_btrfs=$o,compress=lzo,ssd,noatime

        # Remount the partitions
        mount -o compress=lzo,subvol=@,$o_btrfs /dev/mapper/cryptroot /mnt
        mount -o compress=lzo,subvol=@home,$o_btrfs /dev/mapper/cryptroot /mnt/home
        mount -o compress=lzo,subvol=@snapshots,$o_btrfs /dev/mapper/cryptroot /mnt/.snapshots
        ```

* Install the system

    At this point, normally, you'd run the pacstrap command. Instead, we'll connect an Ethernet link from the source computer and the target computer. The source computer's `NetworkManager` mode shall be "Share with other computers".

    We can now run `rsync`:
  
    ```
    rsync --info=progress2 -aAXvut --exclude={"/dev/*","/proc/*","/sys/*","/tmp/*","/usr/tmp/*","/run/*","/mnt/*","/media/*","/var/cache/*","/","/lost+found"} root@10.42.0.1:/ /mnt
    ```

    You might need to enable SSH root access on the source computer with `PermitRootLogin yes` in `/etc/ssh/sshd_config`.

    Careful, the `-v` flag in the rsync command means verbose, it'll print EVERY file copied, and this slows the process A LOT because the TTY cannot handle this much throughput. Two workarounds:
        + Disable the `-v` option: you may wonder what's happening and not know, it's a long process
        + Switch to tty2 (`ctrl+alt+f2` for example) while the transfer is happening on tty1, this makes things faster because tty1 doesn't have to display everything anymore. You can always switch back when you're curious about the progress.

    **Note:** I did that when the source system was running without any issues, so I was able to monitor the throughput with Gnome's system monitor.

* If the rsync is successful, you now need to overwrite the `fstab` by one that makes sense with what's currently mounted

    ```
    genfstab -L -p /mnt > /mnt/etc/fstab
    ```

* You should now be able to `chroot`

    ```
    arch-chroot /mnt
    ```

* Edit the hostname
* `mkinitcpio -p linux`
* Edit the grub `cryptdevice` command line. I used the following process to get the UUID and do a "fake copy paste" as you don't have access to this sort of things:

    ```
    # Find out what device UUID it is (look for crypto_LUKS)
    blkid

    # Add the UUID to the grub defaults
    blkid | grep crypto_LUKS >> /etc/default/grub

    # EDIT the /etc/default/grub to replace the old UUID with the new one that has been appended
    nano /etc/default/grub
    ```

    It should look something like that:
    ```
    GRUB_CMDLINE_LINUX="cryptdevice=UUID=d5ab7981-9a8a-4c58-8730-5888469d08f8:cryptroot:allow-discards"
    ```

    Now regenerate the config and triple check it
    ```
    grub-mkconfig -o /boot/grub/grub.cfg
    ```

    Reinstall grub, just in case (normally the /boot partition has been rsynced as well)
    ```
    grub-install --target=x86_64-efi --efi-directory=/boot
    ```

    Also check your `fstab` before rebooting.

* Install missing drivers (e.g. going from an Intel graphics card to AMD)
* Reboot

    ```
    # Exit new system and go into the cd shell
    exit

    # Unmount all partitions
    umount -R /mnt

    # Reboot into the new system, don't forget to remove the usb
    reboot
    ```

Voilà!

Again, all these need commands need to be understood before being executed, and this post should definitely be used as a reference alongside the Arch wiki.

