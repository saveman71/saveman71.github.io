---
layout: post
title:  "How to remove trailing slash on Jekyll with Cloudflare"
date:   2023-01-09 11:02:42 +0100
categories:
---

Previously all my blog posts were served from Github pages with a trailing slash, for example:

```
https://saveman71.com/2023/some-article/
```

This is because the permalink setting of Jekyll _had_ a trailing slash included. Wanting to change that for cleanliness and ✨SEO reasons✨, I made the [following change](https://github.com/saveman71/saveman71.github.io/commit/888a8d34319dffeb8b04bcc8acea09e6cccf4445#diff-ecec67b0e1d7e17a83587c6d27b6baaaa133f42482b07bd3685c77f34b62d883L16-L17) a few days ago:

![](/assets/images/2023-01-09-remove-trailing-slash-cloudflare-jekyll/diff.png)

All was well, until I learnt via Google's search console that I had more and more 404s. [This guide](https://github.com/slorber/trailing-slash-guide) came in handy in identifying the culprit: GitHub pages doesn't do anything about trailing slashes. If it's there, it considers it a directory and looks for an `index.html` file in there. Since the change was made, files were now `some-article.html` and not `some-article/index.html`, thus the 404s.

This could just be left alone and it could probably fix itself, Google would quicly notice that and remove the old pages, index the new ones; etc. But for, again, SEO reasons, it's best to properly "migrate" the pages with a 301 redirect, so the SEO of each page isn't lost in the process.

Unfortunately, neither GH pages or Jekyll (unless resorting to ugly techniques such as creating the directories, adding meta redirects there, etc.) can actually do these redirects themselves. That's where Cloudflare comes in. Not the ideal solution, but for such a small "fix", it's practical and not an actual dependency.

I couldn't find a blog article that would explain how to solve that problem, that's why I'm writing this!

Enough talk, let's get down to business. So you have your CF property, go to URL rules, create a new rule, and:

[![Trailing slash removal using cloudflare][1]][1]

URL: `https://example.com/*/`

Destination URL: `https://example.com/$1`

  [1]: /assets/images/2023-01-09-remove-trailing-slash-cloudflare-jekyll/cf.png

TADAA!

This was also (briefly) posted as answers to Stack Overflow [here](https://stackoverflow.com/a/75055888/2367848) and [here](https://stackoverflow.com/a/75055689/2367848).
