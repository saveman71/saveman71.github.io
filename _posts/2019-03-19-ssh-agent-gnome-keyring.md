---
layout: post
title:  "Using Gnome Keyring as a shared SSH agent across terminals"
date:   2019-03-19 11:19:42 +0100
categories: ssh agent gnome keyring
---

# Intro (skip if you're in a hurry)

One day I had enough of manually entering my ssh keys passphrase every time I was using ssh (pretty much always with git).

I looked up what was available online to have a global ssh agent, shared across all my open and future terminals.

The [Arch Wiki mentions](https://wiki.archlinux.org/index.php/SSH_keys#SSH_agents) mentions a nice way with a Systemd user service. This works really well, but you still need to unlock your keys everytime you start your computer.

# Using Gnome's keyring

Then comes the [Gnome Keyring](https://wiki.archlinux.org/index.php/GNOME/Keyring), which already manages all my saved passwords in Chrome, my PGP keys and whatnot. In my system, it was even already managing my SSH keys with its own ssh-agent, but I wasn't profiting from it, because my shell wasn't configured to use it!

To know to which agent to connect to, `ssh-add` relies on the `SSH_AUTH_SOCK` environment variable, which describes the UNIX socket to the running agent.

In our case, it's `gnome-keyring-daemon -s` that provides a way to know which socket SSH should use.

```
$ gnome-keyring-daemon -s
SSH_AUTH_SOCK=/run/user/1000/keyring/ssh
```

So all we need to do is to `eval` the output of that command, so just add this to your `.bashrc`:

```sh
# SSH agent
eval $(gnome-keyring-daemon -s)
```
