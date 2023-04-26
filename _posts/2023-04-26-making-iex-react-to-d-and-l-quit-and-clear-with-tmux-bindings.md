---
layout: post
title:  "Making IEx react to ^D and ^L (quit and clear) with tmux bindings"
date:   2023-04-26T11:25:46+02:00
categories: tmux elixir iex
---

I've been using tmux for a while now, and I recently started a new position where I'm using Elixir.

I've been using it to run IEx, the Elixir REPL. I've been annoyed by the fact that IEx doesn't react to ^D (quit) and ^L (clear screen) like other REPLs do, so I decided look for a solution.

Quitting IEX being almost like [quitting Vi](https://stackoverflow.com/questions/30085376/another-way-to-exiting-iex-other-than-ctrl-c), and since the team [doesn't seem to have any intention](https://github.com/erlang/otp/issues/4414) to change this, I decided to use tmux bindings to make it happen.

I was inspired by [this post](https://elixirforum.com/t/how-to-fix-iex-ctrl-d-exit-and-ctrl-l-clear-with-autokey/26075) which uses [AutoKey](https://github.com/autokey/autokey) but it only supports X11 and I didn't like the idea of interfacing too far away from the terminal.

As it's not possible to add key bindings directly at the shell level, the next best thing is to use tmux bindings.

I added the following lines to my `.tmux.conf`:

```tmux
bind -n C-d if -F "#{m:*iex*,#{pane_title}}" 'send-keys C-\\' "send-keys C-d"
bind -n C-l if -F "#{m:*iex*,#{pane_title}}" 'send-keys clear\n' "send-keys C-l"
```

All it does is checking that the current pane runs iex, and if so, it sends the appropriate key sequence.

* `C-\` is the sequence for quitting iex
* `clear\n` is the sequence for clearing the screen

If the pane doesn't run iex, it just sends the unmodified key sequence.

I'm pretty happy with the result, and I hope it can help someone else.
