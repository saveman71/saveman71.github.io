---
layout: post
title:  "Automatically pause music on screen lock on Linux"
date:   2019-04-24 11:19:42 +0100
categories: linux hacks mpris
---

# Introduction

I've always been annoyed that the music I listen to when I work continues to play when I'm away from the keyboard. Having to listen to the end of your favorite Hans Zimmer soundtrack when coming back from a break is not fun.

Hopefully there is a thing I always do when I'm leaving my computer: **lock the screen**. So I started looking around on the internet, thinking "There must be someone who did this before". But no, I had leads, but not a functionnal and plug and play solution I could just install on my system.

I also had the need that it would work with pretty much anything that could play audio, because of a second problem : my headphones are pretty noisy when not on my head, so if I forget a Youtube video playing for example, it could annoy some of my coworkers.

# Builing the solution

## Listening to screen locks/unlocks

My first step was to find a way to know when I'm locking my computer, programmatically. I'm using [Cinnamon's](https://github.com/linuxmint/cinnamon-screensaver) (even though I'm not using Cinnamon, but they managed to make it modular enough!). This lock screen is based on Gnome's that is pretty widely used, so I was able to quickly find a way to listen to the events through `dbus` [on StackExchange's UNIX forum](https://unix.stackexchange.com/a/28183/93390).

I just had to replace the interface with my screenlockers (`org.cinnamon.ScreenSaver`), and voilà:

```bash
dbus-monitor --session "type='signal',interface='org.cinnamon.ScreenSaver'" | \
( while true
    do read X
    if echo $X | grep "boolean true" &> /dev/null; then
      echo "pause"
    elif echo $X | grep "boolean false" &> /dev/null; then
      echo "play"
    fi
    done )
```

This nifty little script (let's call it `listen-lock.sh`) allows us to react on screen locks/unlocks.

## Pausing and playing through MPRIS2

So we're looking to programatically pause and play (control) as many audio players as we can, through ideally a single interface. A quick search leads us to MPRIS, wich the name actually really describes what we need: _Media Player Remote Interfacing Specification_. Great!

Now, not every player out there supports this spec, but a reasonnable amount do. At least the one I'm using the most, Spotify, implements the spec! If your player of choice doesn't, it's possible to install plugins. Here are the ones I'm using:

* Chrome (supports Youtube videos, Soundcloud): <https://github.com/otommod/browser-mpris2>
* MPV: https://github.com/hoyon/mpv-mpris, and it's AUR page: <https://aur.archlinux.org/packages/mpv-mpris/>

For debugging purposes, I'm using [Qt's D-Bus Viewer](https://doc.qt.io/qt-5/qdbusviewer.html). It allows to search for "mpris" and validate that your plugins are working. For example:

![Keyboard > Layouts > Options... window](/assets/images/2019-04-24-automatic-pause-music-screen-lock-linux-mpris/dbus.png){: max-width="50%" .screenshot}

I can validate both my mpv plugin and Spotify's native interface work as expected.

You can now send messages to the MPRIS2 interface with the `dbus-send` command. The verbs we're interested in are:

* `org.mpris.MediaPlayer2.Player.Pause` for pausing
* `org.mpris.MediaPlayer2.Player.Play` for playing

Let's try pausing:

```bash
dbus-send --dest=org.mpris.MediaPlayer2.spotify /org/mpris/MediaPlayer2 org.mpris.MediaPlayer2.Player.Pause
```

If that works, congrats! Now let's put all that together to have a first version of our script.

# Putting it together

We can use our first script (`listen-lock.sh`) as an event emitter and react on these events to play or pause a chosen player via MPRIS.

```bash
#!/bin/bash

./listen-lock.sh | \
( while true
    do read X
    if echo $X | grep "pause" &> /dev/null; then
        dbus-send --print-reply --dest=org.mpris.MediaPlayer2.spotify /org/mpris/MediaPlayer2 org.mpris.MediaPlayer2.Player.Pause
    elif echo $X | grep "play" &> /dev/null; then
        dbus-send --print-reply --dest=org.mpris.MediaPlayer2.spotify /org/mpris/MediaPlayer2 org.mpris.MediaPlayer2.Player.Play
    fi
    done )

```

This first version should pause on lock, and play Spotify on unlock!

# Only resume if previously playing

Now that you've used the previous version for a bit, you quickly noticed a big problem. Your player is paused, you lock, and suprise music comes out when you unlock! One way to fix that is to keep a state of "playing" players when locking, so we can correctly restore that state on unlock.

To know if a player is currently playing, we can once again use D-BUS with the MPRIS2 interface:

```bash
dbus-send \
    --print-reply \
    --dest=org.mpris.MediaPlayer2.spotify \
    /org/mpris/MediaPlayer2 \
    org.freedesktop.DBus.Properties.Get string:'org.mpris.MediaPlayer2.Player' string:'PlaybackStatus
```

This will output something like:

```
method return time=1556097097.642530 sender=:1.406 -> destination=:1.8488 serial=3827 reply_serial=2
   variant       string "Playing"
```

We don't care about the first line, but the second should tell us wether the player is playing or not. If the player is paused, the string will be `"Paused"`. If the MPRIS interface isn't available (i.e. the player isn't launched), the command will exit with the error code `1`.

Given these information, we can easily get a status with the following command:

```bash
status=$((
    dbus-send \
    --print-reply \
    --dest=org.mpris.MediaPlayer2.spotify \
    /org/mpris/MediaPlayer2 org.freedesktop.DBus.Properties.Get string:'org.mpris.MediaPlayer2.Player' string:'PlaybackStatus' \
    2>/dev/null | tail -1 | cut -d\" -f2
) || echo "")
```

This way, the `status` variable will either be `"Playing"`, `"Paused"` or `""` when no status is available.

Let's put all this together:

```bash
#!/bin/bash

last_playing=""

./listen-lock.sh | \
( while true
    do read X
    if echo $X | grep "pause" &> /dev/null; then
        last_playing=""
        status=$((
            dbus-send \
                --print-reply \
                --dest=org.mpris.MediaPlayer2.spotify \
                /org/mpris/MediaPlayer2 org.freedesktop.DBus.Properties.Get string:'org.mpris.MediaPlayer2.Player' string:'PlaybackStatus' \
                2>/dev/null | tail -1 | cut -d\" -f2
        ) || echo "")
        if [ "$status" = "Playing" ]; then
            last_playing="spotify"
            dbus-send --print-reply --dest="org.mpris.MediaPlayer2.$last_playing" /org/mpris/MediaPlayer2 org.mpris.MediaPlayer2.Player.Pause
        fi
    elif echo $X | grep "play" &> /dev/null; then
      dbus-send --print-reply --dest="org.mpris.MediaPlayer2.$last_playing" /org/mpris/MediaPlayer2 org.mpris.MediaPlayer2.Player.Play
    fi
done )
```

What about multiple players support you say?

# Mutliple players

Just add a for loop per action and send the D-Bus messages for each command, and transform our `last_playing` variable to an array!

```bash
#!/bin/bash

players=("spotify" "chrome" "mpv")
last_playing=()

./listen-lock.sh | \
( while true
    do read X
    if echo $X | grep "pause" &> /dev/null; then
        last_playing=()
        for player in "${players[@]}"; do
            status=$((
                dbus-send \
                --print-reply \
                --dest="org.mpris.MediaPlayer2.$player" \
                /org/mpris/MediaPlayer2 org.freedesktop.DBus.Properties.Get string:'org.mpris.MediaPlayer2.Player' string:'PlaybackStatus' \
                2>/dev/null | tail -1 | cut -d\" -f2
            ) || echo "")
        done
    elif echo $X | grep "play" &> /dev/null; then
        for player in "${last_playing[@]}"; do
            dbus-send --print-reply --dest="org.mpris.MediaPlayer2.$player" /org/mpris/MediaPlayer2 org.mpris.MediaPlayer2.Player.Play
        done
    fi
done )
```

# Bonus: stopping music playback on jack connect/disconnect

Additionnally to screen lock/unlock, I wanted my music to stop when I was unplugging my headphones, when going to a meeting with my laptop for example. Given our current script and implementation, it's very easy to add new ways to trigger the pause/unpause of the media players.

After a bit of Google-fu we quicly find that a way to listen to these events is provided through the [`acpi_listen` command, of the `acpid` daemon](https://wiki.archlinux.org/index.php/acpid).

`acpi_listen` will produce lines similar to `"jack/headphone HEADPHONE unplug"` when the jack cable is unplugged, so we can just create a new script `listen-jack.sh` with the following:

```bash
acpi_listen | \
( while true
    do read X
    if echo $X | grep "jack/headphone HEADPHONE unplug" &> /dev/null; then
        echo "pause"
    elif echo $X | grep "jack/headphone HEADPHONE plug" &> /dev/null; then
        echo "play"
    fi
done )
```

Then plug it in our original script:

```bash
#!/bin/bash

players=("spotify" "chrome" "mpv")
last_playing=()

(./listen-lock.sh & ./listen-jack.sh) | \
( while true
    do read X
    if echo $X | grep "pause" &> /dev/null; then
        last_playing=()
        for player in "${players[@]}"; do
            status=$((
                dbus-send \
                --print-reply \
                --dest="org.mpris.MediaPlayer2.$player" \
                /org/mpris/MediaPlayer2 org.freedesktop.DBus.Properties.Get string:'org.mpris.MediaPlayer2.Player' string:'PlaybackStatus' \
                2>/dev/null | tail -1 | cut -d\" -f2
            ) || echo "")
            if [ "$status" = "Playing" ]; then
                last_playing+=($player)
                dbus-send --print-reply --dest="org.mpris.MediaPlayer2.$player" /org/mpris/MediaPlayer2 org.mpris.MediaPlayer2.Player.Pause
            fi
        done
        if [ ${#last_playing[@]} -ne 0 ]; then
            notify-send -i dialog-info -u low -t 1000 "Paused" "${last_playing[@]}"
        fi
    elif echo $X | grep "play" &> /dev/null; then
        for player in "${last_playing[@]}"; do
            dbus-send --print-reply --dest="org.mpris.MediaPlayer2.$player" /org/mpris/MediaPlayer2 org.mpris.MediaPlayer2.Player.Play
        done
        if [ ${#last_playing[@]} -ne 0 ]; then
            notify-send -i dialog-info -u low -t 1000 "Play" "${last_playing[@]}"
        fi
    fi
done )
```

As a bonus I also added notifications!

# Conclusion

I hope this article helped you solve a need that I think a lot of people don't know they need until they're using a similar solution. Coming back to the same music you were listening to before going AFK is one of the good feelings in life. Cheers!
