---
layout: post
title:  "Recovering ZSH history from histdb"
date:   2021-09-30 23:39:42 +0100
categories: linux zsh histdb history zsh_history
---

# Intro

I just love my zsh history. It contains all the commands I frequently use and I would basically feel useless as a programmer if I couldn't do a quick `ctrl+R` to look back earlier in the day, the week or even last year.

My current configuration is the following: 

```
setopt append_history
setopt extended_history
setopt hist_expire_dups_first
setopt hist_ignore_dups # ignore duplication command history list
setopt hist_ignore_space
setopt hist_verify
setopt inc_append_history
setopt share_history # share command history data

source $HOME/git/zsh-histdb/sqlite-history.zsh
autoload -Uz add-zsh-hook

# source $HOME/git/zsh-histdb/histdb-interactive.zsh
# bindkey '^r' _histdb-isearch
```

I added histdb two months ago in an attempt at syncing my history across computers (though now I only use one computer, [how the turntables](https://www.youtube.com/watch?v=XmLnHPx_q2A)...). It stores the history as a `sqlite3` database which makes merging and knowing what host contributed what easier. Back then, I made a good call: "import" all the history I had to the `histdb` database.

At first I was using the interactive `histdb` search, but I didn't feel like it was any better than the built-in one so I quickly disabled it.

# The drama

Now comes today, where for some reason, `zsh` decided I didn't need the last 6 months of my history anymore (I have over 6 years of history, adding up to a 4M file). As mentioned earlier, I felt naked. What was that command that you use to change directory again?

At first I felt desperate, but then I remembered `histdb` does save everything in a separate database! A quick `sqlite3 ~/.histdb/zsh-history.db` later and I confirmed everything was there. The only caveat is histdb ignores some commands by default like `cd` and `ls`, but that's not the ones I'm interested in.

I could have re-introduced the interactive reverse search from histdb, but I figured it would be quite straightforward to instead try to re-create a `.zsh_history` file from the database.

# Re-creating `.zsh_history`

I thought that would be easy. I mean straightforward. I mean, I really thought zsh's format would be logical right? No. Since I had enabled `extended_history`, the format is the following ([this answer on Stack Overflow helped!](https://stackoverflow.com/a/37977775/2367848)):

```
: timestamp:duration;command
```

Colon, space, timestamp, colon, duration, semicolon and at last the command. Multiline commands are represented by backslashes but hopefully these are stored as-is in the database.

Let's export that from the database. It sure looks a lot like csv, so I tried that first, except CSV don't start with a colon, and don't mix `;` and `:`, and add quotes when feeling like it. So sqlite's CSV exporter won't work.

However, sqlite does export to JSON! Ah, finally a standardized format. Using `jq`, we can process that CSV into the weird `zsh_history` format, and then replace the file with what we produced, after diffing it a few time with the broken one to be sure we're matching the format. For me, only the timestamps did change, because I guess zsh changed them when recovering the broken history.

```
❯ sqlite3 ~/.histdb/zsh-history.db
SQLite version 3.36.0 2021-06-18 18:36:39
Enter ".help" for usage hints.
sqlite> .mode json
sqlite> .once out.json
sqlite> SELECT history.start_time,history.duration,commands.argv FROM history LEFT JOIN commands ON history.command_id = commands.rowid;
```

This creates a `out.json` that looks like this:
```
❯ head out.json   
[{"start_time":1627597143,"duration":0,"argv":"echo \"hello world\""},
{"start_time":1582471606,"duration":0,"argv":"yay -Syu"},
{"start_time":1582471611,"duration":0,"argv":"htop"},
...etc.
```

We need to make sure there are not `null` values as commands though, and also that the durations, sometimes `null`, are casted to `0`. The resulting command is:

```sql
SELECT history.start_time AS start_time,IFNULL(history.duration, 0) as duration,commands.argv
FROM history LEFT JOIN commands ON history.command_id = commands.rowid
WHERE commands.argv IS NOT NULL;
```


We can then process it with `jq`:

```sh
cat out.json | jq -r '.[] | .argv |= sub("(?<=[^\\\\])\n";"\\\\\n";"g") | ": \(.start_time):\(.duration);\(.argv)"' > history
```

It just means, output the three fields, with `: ` before and then a `:` and a `;` between the fields. It also replaces (`sub(` call) newlines not containing a bash like backslash with a double backslash (`\\`) followed by `\n`, using a postive lookahead:

```
(?<=[^\\])\n
```

Regex explanation and tests, because above it looks a bit ugly with escaping: [https://regex101.com/r/L1rYnh/1](https://regex101.com/r/L1rYnh/1).

Then diff to confirm everything looks good:
```
diff history ~/.zsh_history
```

Do a backup for good measure:
```
cp ~/.zsh_history ~/.zsh_history.corrupted.backup
```

And overwrite:
```
cat history > ~/.zsh_history
```

Using the redirection keeps the open file handles valid for anything that might be using this file (like your shell!)

Here's a one-liner (**DO A BACKUP BEFORE**):

```
sqlite3 -json zsh-history.db "SELECT history.start_time AS start_time,IFNULL(history.duration, 0) as duration,commands.argv from history left join commands on history.command_id = commands.rowid WHERE commands.argv IS NOT NULL;" | jq -r '.[] | .argv |= sub("(?<=[^\\\\])\n";"\\\\\n";"g") | ": \(.start_time):\(.duration);\(.argv)"' > ~/.zsh_history
```

**Update**: [@Neamar](https://github.com/Neamar) suggested using SQL to produce the weird format directly with:
```
SELECT ": " || history.start_time || ":" || history.duration || ";" || commands.argv FROM history LEFT JOIN commands ON history.command_id = commands.rowid;
```

However you're on your own for the multiline post processing and need to add back casting as well.

Restart your shell, and your history is back! Yay!

Hope that helps even only one of you :)
