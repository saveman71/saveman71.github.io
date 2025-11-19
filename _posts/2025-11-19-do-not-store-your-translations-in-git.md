---
layout: post
title: "Do not store your translations in Git"
date: 2025-11-19 23:43:42 +0100
categories: elixir gettext translations git ci workflow localazy
---

For years, we committed our source translation files to Git. It seemed like the right thing to do—after all, they're part of the codebase, right? 

Turns out, we were making our lives unnecessarily complicated.

I probably Googled too many times how to `make gettext faster` ([Speed up the compilation of Elixir projects that use Gettext](https://angelika.me/2020/09/02/speed-up-the-compilation-of-elixir-projects-that-use-gettext/), [How to speed up your Elixir compile times](https://medium.com/multiverse-tech/how-to-speed-up-your-elixir-compile-times-part-1-understanding-elixir-compilation-64d44a32ec6e)). 

If you've been there, keep reading.

# (Almost) everything in Git

Our Elixir app uses Gettext, which is pretty much the standard for internationalization. We use Localazy as our translation management platform where our staff translates strings into various languages.

When I joined, we had around 6,000 strings. Now we're past 10,000. These translations live in PO files (PO stands for Portable Object, don't ask), and there's a POT file (T for Template) that drives our Localazy tool to check for new strings.

The first part of the workflow went something like this:

* Developer adds a `gettext("some new string")` call in the code
* Developer runs `mix gettext.extract` to sync the POT file with the codebase, they'd normally also update the PO file manually, but since we consider the code to be the source of truth, we actually wrote a small bit of code to generate the source language PO from the POT.
* Developer commits both the code changes AND the PO/POT files

Fortunately, we had already moved away from the automated PR downloading the translations and committing them, but we still had generated files committed. "It makes reviewing spelling mistakes easier" was something we told ourselves to make us feel better.

# The Problem: Compile-Time Complexity

Here's where things got interesting. Since PO files are parsed and gettext calls are inlined at compile time, each locale adds to compile time. We're talking O(n) complexity where n is the number of locales.

To keep everything "consistent", we had this de facto standard: always sync the POT file with the list of gettext calls in the code (the source of truth), then commit both the PO (for the source language) and the POT file.

This meant that for each commit (if you added even a single new gettext call), you theoretically needed to run `mix gettext.extract`. This command recompiles the entire project to evaluate every gettext call and come up with the new strings in both PO and POT files.

**1.5 minutes on a beefy laptop** it took. Yep, big monolith.

The workflow went something like this:

* Once your PR is pushed, CI checks that everything is in sync with `mix gettext.extract --check-up-to-date`
* Once the CI check passes and merged to `develop`, a daily build sends new strings to Localazy
* On deployment, we'd call `localazy download` to get all translations

As stated, each PR was blocked by a `mix gettext.extract --check-up-to-date` task, as suggested in the [official docs](https://hexdocs.pm/gettext/Mix.Tasks.Gettext.Extract.html), to check that the files were in sync with the code.

Sounds reasonable, right? Well...

# Why we stuck with this workflow for so long

This led to a bunch of different workflows, none of them great:

* Some folks would remind themselves to run the extract task before every commit. Takes a minute and a half, breaks your flow, but hey, at least CI won't fail.

* Others were adding all their changes, then tacking on a single commit at the end called `gettext`. Then maybe do a few fixes. Have a failed build. Add another `gettext` commit. Not ideal!

For fun here's an excerpt I got by running `git log --grep="gettext"`

```
49bf8947c0 Fixing post rebasing gettext
1184593889 extracting gettext after rebasing
bed14725d1 re-extract gettext following merge
da3a902c6f gettext rebase inconsistancies fix
fb35ff7db6 gettext
59ba9cea53 Update gettext
9bfc4f0fa7 Update gettext
5157e9f85b Update gettext
d04b956baa Update gettext
da096be3c6 Update gettext
fb9963e867 Update gettext
db0b180dc2 use gettext
458706dc87 Update gettext
4d56537088 chore: update gettext files
7f5c25d2a4 chore: format files and update gettext files
7da1412226 chore: update gettext files
a745b2f3a7 chore: update gettext files (again)
9fe8e478c9 chore: update gettext files
b93e30f897 chore: update gettext files
78ffae2e81 chore: update gettext files
c461756cf0 chore: update gettext files
3f3ca6df16 chore: update gettext files
387cbb2000 chore: update gettext files
69d8629e3e gettext
5960bb2b85 Fixed gettext error.
7944862c4c Update gettext
fcdf619670 Update gettext
4c46452dc8 Update gettext
0c89da460d Update gettext
bfc62e2664 Update gettext
6460b6f64d Use gettext
41c35c816d chore: update gettext files
42bc1eeccd update gettext
375591249d update gettext
34f7d00422 Update gettext stuff after rebase ...
aef7a8ed0e chore: update gettext files
f64b809baa mix gettext
bddd91148a chore: gettext
de0d27b8da mix gettext
516acaa05c chore: gettext and credo
1da19cf8bc mix gettext
4ec345fcd4 chore: update gettext files
849877911e Add gettext
5562a1a5fd Use of gettext_with_link
8697c57525 🌐 gettext
01e72f8aff 🌐 correct gettext for failure document creation
36d676dcce 🌐 updated gettext
df7e8ab5b8 mix gettext
bc80302380 mix gettext
2c5e6108e5 mix gettext
fca475f4df chore: update gettext files
27729fcb4a add virtual field + mix gettext
5cb03227a2 🌐 gettext
31be0b5769 chore: update gettext files
b679fd56fb chore(gettext): 💬 Update gettext keys
d01b0d1cea refactor: 💬 Add missing gettext
205127c537 chore: gettext
d290e1c44d gettext
42e00ddfec 🌐 added more missing gettexts
e8868cda16 🌐 added missing gettext
465f523b09 update gettext
d2442a819e chore: cleanup test gettext
c229b81d35 mix gettext
da5e36e8af mix gettext
af748b8c43 update gettext
534a7b14be mix gettext
9cf4b1fc9e chore: update gettext files
f3b8fa04d1 chore: update gettext files
70df45213c chore: update gettext files
a24d10398b chore: update gettext files
c4a0de5726 update gettext
68b0bda86c 🌐 gettext
edb112487c chore: update gettext files
```

...Yeah. To try to combat this, we had a very specialized Git pre-commit hook (I wrote it) that did the check automatically, so you wouldn't discover you forgot to run it in CI. I don't know if many enabled it!

While a fun exercise, and a gentle reminder that bash is not a real programming language (albeit being the most portable choice, except, well, macOS) and that 400 lines of bash, even if unit tested, will break in any possible way. I believe I must have spent like a full week on that task. All to try having better commits. Duh.

One day, while reviewing yet another `gettext` commit, it finally clicked.

# The Eureka Moment

We don't have to live like this.

We already have the source of truth: **the source code itself**. The gettext calls in our Elixir files are what matters. Everything else is derived. Our translations don't live in the repo anyway, they're downloaded from Localazy.

We could just extract the POT file when needed, when building in CI to upload to Localazy. And we pull all the PO files anyway when building for production. Sounds obvious now that I write about it.

Two sources of truth. Multiple CI steps. Complex workflows. Pre-commit hooks. Slow extract commands blocking every commit. Conflicts! Do I continue?

# The Solution: Extract On Demand

That's it. No more up-to-date checks blocking every commit. Just extract when needed, in a CI environment, not slowing you down. Upload when appropriate, and download translations as part of your deployment process.

The diff said it all, with all the POT/POs deleted + 100s of lines of tooling:

**+49 lines added, -58,939 lines removed**

# Conclusion

We won't reclaim the hours of lost build time, but at least that's some CPU cycles saved for everybody.

Also, if you find yourself writing bash scripts to enforce a workflow, maybe step back and ask: is there a simpler way?
