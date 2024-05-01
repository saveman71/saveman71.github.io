---
layout: post
title:  "Streamlining `git commit --fixup` and `git rebase --autosquash` with `gfrauto`"
date:  2024-05-01 13:12:42 +0100
categories: git rebase commit fixup autosquash gfrauto
---

One of the things I like about Git is the ability to fixup commits. It's a great way to keep the
history clean and make sure that changes are grouped together, in logical, atomic commits.

This makes reviewing easier, and I want to provide tooling to other folks that might not know about
this feature at all -- or might not be using it as much as they could because it's a bit
cumbersome.

# Intro

The problem with `git commit --fixup` is that it requires you to provide the commit hash of the
commit you want to fixup. The usual workflow is to blame the line you want to fix (which is a pain,
because you'll have a ton of `Not Committed Yet` lines), copy the hash, and then run `git commit
--fixup <hash>`.

Helpful tip though, you can get rid of the `Not Committed Yet` lines by adding `HEAD` to the blame
command. For example, `git blame HEAD -- <file>`, but that's not something that the Sublime Text
plugin I use does.

Then, when you're ready to squash the fixup commit, you need to run `git rebase -i --autosquash
main`, it opens the editor, then save and quit.

Hopefully, you correctly identified the commit you wanted to fixup, and you're done.

Now, imagine we get a PR review, and we have 10s of changes to make. That's a lot of manual work.

# Automated fixup with `gfra`

Now the function I'll introduce doesn't solve the problem of identifying the commit you want to
fixup, but it does automate the process of creating the fixup commit and rebasing interactively to
autosquash the changes.

```bash
gfra() {
    git commit --fixup="$1" --no-verify; git rebase --autosquash "$1^"
}
```

Bash experts out there will say "ha, that's simple", and it is. Easier than going back again and
again in your history to find the command though.

The `gfra` name is inspired from the zsh git aliases family, and are just initials for `git fixup
rebase autosquash`, just like `gs` is `git status`.


## Usage

The usage is simple:

```bash
gfra <commit-hash>
```

# Automating Commit Fixes with `gfrauto`

While `gfra` nails the process of fixing and rebasing a single commit, `gfrauto` takes it a step
further -- or more like ten -- by automating the detection of the commit that modified a particular
line in a staged file. No more manual blame, copy-pasting, or rebase editing.

Without further ado, here is the function (zsh syntax for the `read` commands, so be careful if you
use it in bash):

```bash
gfrauto() {
  # Fist, display the changes
  git diff --staged

  read "?Continue? ^C to cancel"

  # Extract the line number from the diff
  line=$(git diff --staged --unified=0  | grep -Po '^@@ -[0-9]+(,[0-9]+)? \+\K[0-9]+(,[0-9]+)?(?= @@)');

  # If we have multiple files, arbitrarily pick the first one
  line=$(echo $line | head -1);

  # Line is either a single line or a range of lines
  # E.g. 10 or 10,20
  # If it's a range, we need to split it and get the first line
  line=$(echo $line | cut -d, -f1);

  # Extract the file name from the diff
  file=$(git diff --staged --unified=0 | grep -Po '^\+\+\+ ./\K.*');

  # If we have multiple files, arbitrarily pick the first one
  file=$(echo $file | head -1);

  # Find the commit that last modified the line in the file
  commit=$(git log -u -L $line,$line:$file -1 --pretty=format:"%h" | head -1);

  # Display the hash, the description of the commit for confirmation
  git show --no-patch --format="%h %s" $commit

  read "?Continue? ^C to cancel"

  # Let the magic happen
  gfra $commit
}
```

## Usage

* Stage your changes, as usual, keep them light since the script is dumb and will just base its
  search on the first file it finds. Make sure you only stage changes that belong to the same
  commit.
* Run `gfrauto` and confirm the diff, then the found commit.
* That's it, it's fixed up and rebase automatically

The best part is that if your shell history dedupes entries, you won't ever clutter your history with different calls to the `gfra` function.

# Conclusion

I've used `gfra` for a while and consider it battle tested. The first usage in my zsh history is on
dates from more than 5 years ago and I use it multiple times a day. I however don't pretend to take
credit on such a simple function.

For `gfrauto`, it's been present as a long one-liner in my history, refined over time. Here is it
for posterity:

```bash
# Do not use this
gfra $(line=$(gd --staged --unified=0  | grep -Po '^@@ -[0-9]+(,[0-9]+)? \+\K[0-9]+(,[0-9]+)?(?= @@)'); file=$(gd --staged --unified=0 | grep -Po '^\+\+\+ ./\K.*'); git log -u -L $line,$line:$file -1 --pretty=format:"%h" | head -1)
```

Obviously, it's more cryptic, handled less edge cases, so I finally took the time to write it down
in a more readable form, and I'm happy to share it today.
