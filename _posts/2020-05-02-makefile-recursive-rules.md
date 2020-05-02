---
layout: post
title:  "Makefile with recursive rules (Cartesian product / combination)"
date:   2020-05-01 15:20:42 +0100
categories: makefile rules targets combination Cartesian product
---

In this article I'll show you how I made a "recursive", "combining" Makefile for the [KISS Launcher](https://github.com/Neamar/KISS/) project. Basically, we had the need to generate internationalized screenshots of the Android app. We have a number of screenshots, and a number of locales to iterate through:

Locales:
```
en-US fr-FR
```

Source files (templates):
```
1.svg 2.svg 3.svg 4.svg
```

The idea is to use Inkscape to export a variation of each screenshot into a locale specific folder. I'm told that can be referred as "combination" or "cartesian product". With the previous files and locales, this would result in the following tree of files:

```
├── 1.svg
├── 2.svg
├── 3.svg
├── 4.svg
├── en-US
│   ├── 1.png
│   ├── 2.png
│   ├── 3.png
│   └── 4.png
└─── fr-FR
    ├── 1.png
    ├── 2.png
    ├── 3.png
    └── 4.png
```

The list of targets is thus the following:

```
en-US/1.png
en-US/2.png
en-US/3.png
en-US/4.png
fr-FR/1.png
fr-FR/2.png
fr-FR/3.png
fr-FR/4.png
```

Let's first generate this list of targets using a basic Makefile:

```text
locales     := fr-FR en-US
templates   := 1.svg 2.svg 3.svg 4.svg

localized_screenshots = $(foreach locale, $(locales), $(addprefix ${locale}/, $(templates:.svg=.png)))

$(info $$localized_screenshots is [${localized_screenshots}])

all: $(localized_screenshots)

.PHONY: all clean

clean:
	rm -f $(localized_screenshots)
```

The `foreach` loop is quite straightforward: it iterates over the locales and does a substitution of the `svg` extension to `png` (`$(templates:.svg=.png)`, it works on a list!), and adds the current locale prefix to each item.

Here how it looks for now:

```
$ make
$localized_screenshots is [ fr-FR/1.png fr-FR/2.png fr-FR/3.png fr-FR/4.png  en-US/1.png en-US/2.png en-US/3.png en-US/4.png]
make: *** No rule to make target 'fr-FR/1.png', needed by 'all'.  Stop.
```

Okay! We can see that we generated the correct targets: make is looking for a `'fr-FR/1.png'` rule. Let's see how we can write them!

A first intuition would be to write something like this:

```
%/%.png: %.svg:
	# Generate SVG here
```

But GNU make doesn't allow for multiple wildcards in rules, that's unfortunate. Instead, we'll go for a more "dynamic" approach: we'll generate the rules with the `eval` function. That's basically like using pre-processor macros:

```text
locales     := fr-FR en-US
templates   := 1.svg 2.svg 3.svg 4.svg

# eval argument is expanded twice; first by the eval function, then the results of that expansion are expanded again
# when they are parsed as makefile syntax. This means you may need to provide extra levels of escaping for “$” characters when using eval.
define LOCALE_rule
$(1)/%.png: %.svg
    @echo The locale is $(1) and the target is $$@
endef

# Replace eval with info to see what eval evals to!
$(foreach locale, $(locales), $(eval $(call LOCALE_rule,$(locale))))
```

As you can see, we're still using one wildcard, for the template name. But we replaced the locale name with "$1",  which is the argument we gave to the `eval` call, when we iterate through all the locales in the `foreach` loop. If we run make with the above code, and replace `eval` by `info`, we have the following output:

```
$ make
fr-FR/%.png: %.svg
        @echo The locale is fr-FR and the target is $@
en-US/%.png: %.svg
        @echo The locale is en-US and the target is $@
make: *** No targets.  Stop.
```

Nice! We can see our `info` printed two generated rules, one for each locale. That means we're done! If we put it all together:

```text
# Inspired from https://stackoverflow.com/a/32535737/2367848
locales     := fr-FR en-US
templates   := 1.svg 2.svg 3.svg 4.svg

localized_screenshots = $(foreach locale, $(locales), $(addprefix ${locale}/, $(templates:.svg=.png)))

all: $(localized_screenshots)

# eval argument is expanded twice; first by the eval function, then the results of that expansion are expanded again
# when they are parsed as makefile syntax. This means you may need to provide extra levels of escaping for “$” characters when using eval.
define LOCALE_rule
$(1)/%.png: %.svg
	@echo The locale is $(1) and the target is $$@
	./translate.sh $1 $$^ $$@
endef

# Replace eval with info to see what eval evals to!
$(foreach locale,$(locales),$(eval $(call LOCALE_rule,$(locale))))

.PHONY: all clean

clean:
	rm -f $(localized_screenshots) $(localized_screenshots_raw)
```

As the first comment points out, this Makefile was inspired from this [StackOverflow answer](https://stackoverflow.com/a/32535737/2367848), but instead of having two "define" templates, we keep only 1 and instead use the native make wildcards ;)
