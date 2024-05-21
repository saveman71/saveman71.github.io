---
layout: post
title:  "Local Elixir development with ASDF"
date:  2024-05-20 13:12:42 +0100
categories: elixir asdf local bin development
---

Some notes I took while submitting my first PR to the Elixir repo.

# Local development of Elixir with ASDF

First clone [(following the README)](https://github.com/elixir-lang/elixir):

```bash
git clone https://github.com/elixir-lang/elixir
cd elixir
make
```

Takes a minute to compile, then binaries sit in `bin/`. I like it a lot that the whole build process is only a `make` away, refreshing!

## Configuring `asdf`

Now we want to use that version in our project. Our project uses ASDF to manage our tools, so we need to tell ASDF about the local version.

Edit `.tools-version` like so:

```dif
diff --git a/.tool-versions b/.tool-versions
index 0a011338b4..d5ecff1f5a 100644
--- a/.tool-versions
+++ b/.tool-versions
@@ -1,3 +1,3 @@
-elixir 1.15.6-otp-26
+elixir path:../elixir
 erlang 26.1
```

Here I cloned the Elixir repo in the parent directory of my project, so I can use a relative path. You can use an absolute path too.

## Testing

In your repo, run `iex`, and you should see the version you just compiled:

```bash
~/git/elixir-dev elixir-dev*
❯ iex
Erlang/OTP 26 [erts-14.1] [source] [64-bit] [smp:20:20] [ds:20:20:10] [async-threads:1] [jit:ns]

Interactive Elixir (1.17.0-dev) - press Ctrl+C to exit (type h() ENTER for help)
                           ^^^
                             |
                             +-- here!
```
