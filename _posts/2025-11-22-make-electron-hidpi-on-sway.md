---
layout: post
title: "HiDPI Electron <37 apps on Sway"
date: 2025-11-22 18:55:00 +0100
categories: linux wayland sway electron hidpi
---

Electron 38 ships with Chromium 140 which landed [this change](https://chromium-review.googlesource.com/c/chromium/src/+/6775426) which made the Ozone (Chromium's platform abstraction layer) feature detection "auto" by default (from, like not feature detecting at all, apparently). It bases it's decision on the `XDG_SESSION_TYPE` environment variable.

Previously I always had to add those flags to the command line:

```bash
/usr/bin/obsidian --enable-features=UseOzonePlatform --ozone-platform=wayland
```

That works but is annoying: you either need a terminal open and remind yourself to _not_ use [Albert](https://albertlauncher.github.io/) (the launcher I'm using).

I also tried patching the installed `.desktop` files:

```bash
# copy and patch a desktop entry (one-off)
desktop-file-install --dir=$HOME/.local/share/applications /usr/share/applications/obsidian.desktop
# then edit ~/.local/share/applications/obsidian.desktop and add the flags to Exec=
```

It worked, but I was looking for a more permanent solution.

[This answer on the Unix Stack Exchange](https://unix.stackexchange.com/a/768861/93390) hinted me to use the `ELECTRON_OZONE_PLATFORM_HINT` environment variable, which is supported by electron between version 28 and 38 (at which point it was removed, because unnecessary).

I initially tried to edit my `~/.profile`:
```bash
export ELECTRON_OZONE_PLATFORM_HINT=wayland
```

However, this wasn't working:
* Albert was still launching apps with low DPI.
* Launching the app from the terminal (without flags) finally used HiDPI, but I was back to square one.

What worked was embracing systemd (that I don't know enough about) and discovering a new way of setting environment variables:

```bash
cat ~/.config/environment.d/electron-hidpi.conf
ELECTRON_OZONE_PLATFORM_HINT=wayland
```

Another reboot later and Albert was finally launching apps with HiDPI.

That will do, until all my apps are not using Electron 38 ;)
