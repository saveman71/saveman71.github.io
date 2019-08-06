---
layout: post
title:  "Upgrading EJS from 1.0.0 to 2.x"
date:   2019-08-06 15:20:42 +0100
categories: ejs upgrade guide tj mde v1 v2
---

# Introduction

EJS was initially written by famous JavaScript library author TJ (https://github.com/tj/ejs). Having dropped maintenance support, development was taken over by MDE (https://github.com/mde/ejs), and the version 2.x of the library lives there. It's described as a "complete rewrite". Sadly, I've found very few guides on how to "safely" upgrade from the legacy v1.0.0 version to the more recent v2.x, so I'll try to highlight here the different steps we've gone through at La Belle Assiette to upgrade this package!

## Migrating to v1.0

Firstly, you need to ensure you're using the v1.0.0 version. If you're using 0.8 as we were, you need to make sure you're usage of html entites is correct.

HTML entities are not supported anymore, and **will** be escaped by `<%=` tags. E.g. `<%= '&nbsp;' %>` will output `&amp;nbsp;`. The fix is to look for all usages of html entities with the regex `&[^\s]{2,7};`, and to replace them with their UTF-8 equivalents: `<%= '\u00A0' %>` will properly output the ubreakable space character.

# Getting started

The v2.0.0 changelog lists the following:

> ### v2.0.1: 2015-01-02
> 
> + Completely rewritten
> + Single custom delimiter (e.g., `?`) with `delimiter` option instead of `open`/`close` options
> + `include` now runtime function call instead of preprocessor directive
> + Variable-based includes now possible
> + Comment tag support (`<%#`)
> + Data and options now separate params (i.e., `render(str, data, options);`)
> + Removed support for filters

# Data and options now separate params

Make sure all the calls to `ejs.render` and `ejs.renderFile` don't pass ejs any option. If they do, move them to a new, third parameter.

Note that the old syntax is still supported as per the new README:

>It is also possible to use `ejs.render(dataAndOptions);` where you pass everything in a single object

However, I personnally suggest migrating to the new syntax anyway.

# No more filters

The main breaking change is _"Removed support for filters"_. This means for _all_ your templates, if you use global filters with the `<%=: data | filter %>` syntax, this will break.

[#76 at mde/ejs](https://github.com/mde/ejs/issues/76) lists workarounds of how to replace the missing filters functionnality.

## Programmatic usages

A first thing to do is to check for all uses of "ejs.filters." in your code base. Just looking for "ejs.filters", we can find two types of usages in our codebase.

The first, primary usage, is adding a filter to the `ejs` object so it can be used later in the templates:

```js
const ejs = require('ejs');

ejs.filters.cleanField = (input, optionA, optionB) => {
  // some cleaning logic
  return input;
}
```

And then used like this:

```html
<p>
  <%=: title | cleanField:true, false %>
</p>
```

This can be upgraded very simply by adding a new middleware to add a `filters` object to the `locals` object of an express-like application, and moving our filters to a new `filters.js` module:

```js
app.use((_req, res, next) => {
  res.locals.filters = require('./filters.js');
});
```

*Note:* Don't forget to also add the `filters` variable to the places where you render arbitrary ejs outside from express.

And here is `filters.js`:
```js
'use strict'

module.exports.cleanField = (input, optionA, optionB) => {
  // some cleaning logic
  return input;
}
```

We can then use it like this in the `ejs` template:

```html
<p>
  <%= filters.cleanField(title, true, true) %>
</p>
```

Note the transition from the bad `<%=:` syntax to the classic `<%=` one, that disables the filters feature.

Now the second usage you could have in your codebase is this one:

```js
const titleCleaned = ejs.filters.cleanField(title);
```

Here, a developper used `ejs.filters` _outside_ of any template, or ejs context, just because the helper function is accessible from the "global" (or required) `ejs` object. This is just generally a bad practice, so for those, we must refactor our code so that of this special usage can be made from the `filters.js` module we created earlier:

```js
const filters = require('./filters.js');

const titleCleaned = filters.cleanField(title);
```

## Template usages

Now that we eliminated the programmatic usages, there is still the main issue: usages of filters with the `<%:=` syntax.

Look for the following regex in your codebase:

```
/<%[-=]:/g
```

If you have a larger codebase, it's going to be annoying to migrate manually all these usages to proper function calls. We're going to use an editor that supports project wide regex based search and replace to make the task easier.

Let's consider some of the cases we might encounter:

* `<%=: price | moneyFormat %>`: One argument
* `<%=: price | moneyFormat:currency, {convertFrom: 'GBP'} %>`: More than one argument

Each respectively converts to the following target code:

* `<%= filters.moneyFormat(price) %>`: One argument
* `<%= filters.moneyFormat(price, currency, {convertFrom: 'GBP'}) %>`: More than one argument

### One argument

```
/<%([-=]):\s*([^|]*?)\s*\|\s*(\w+)\s*%>/g
```

```
<%\1 filters.\3(\2) %>
```

Example and better highlighting: [https://regex101.com/r/Gk1cAc/3](https://regex101.com/r/Gk1cAc/3)

### More than one argument

```
/<%([-=]):\s*([^|]*?)\s*\|\s*(\w+)(?::([^%]+?))?\s*%>/g
```

```
<%\1 filters.\3(\2, \4) %>
```

Example and better highlighting: [https://regex101.com/r/Gk1cAc/2](https://regex101.com/r/Gk1cAc/2)

### Special case: no arguments

You might have some argument-less usages, don't forget to look for them and remove the filter tag:

```
/<%([-=]):\s*([^|]*?)\s*%>/g
```

```
<%\1 \2 %>
```

Example and better highlighting: [https://regex101.com/r/Gk1cAc/4](https://regex101.com/r/Gk1cAc/4)

### Annoying cases: multiple filters

```
<%=: price | convertFrom:'GBP' | format:'EUR' %>
```

Since that case wasn't too frequent in our codebase I didn't bother overengineer a solution for those, they have to be converted manually. Use the first regex I talked about too look for them!

## Replace builtin filters functionnality

`ejs` 1.0 includes default fitlers, such as `upcase`, `locase`, `truncate`, etc. These obviously won't appear out of nowhere in the `filters` object we crafted, so we'll have to add them.

There is two ways: either you look for all your filter usages, and only add the necessary ones, or you can directly copy the [`filters.js`](https://github.com/tj/ejs/blob/259aa234e43fcd19e4038cd87c8f259c92f2583a/lib/filters.js) file of the 1.0 ejs.

Here are the list of the builtin filters for reference:

* first
* last
* capitalize
* downcase
* upcase
* sort
* sort_by
* size
* length
* plus
* minus
* times
* divided_by
* join
* truncate
* truncate_words
* replace
* prepend
* append
* map
* reverse
* get
* json

# Other Changes

An undocumented change is that the string equivalent of `null` and `undefined` where respectively `'null'` and `'undefined'` in EJS 1.0, and it's now both empty strings (`''`) in EJS 2.0.

I've tried to test the other types as well to check for other differences:

**EJS 1.0**:
```
> ejs = require('ejs')
> ejs.render('<%= null %>')
'null'
> ejs.render('<%= undefined %>')
'undefined'
> ejs.render('<%= 0 %>')
'0'
> ejs.render('<%= {} %>')
'[object Object]'
> ejs.render('<%= [] %>')
''
> ejs.render('<%= "" %>')
''
> ejs.render('<%= true %>')
'true'
> ejs.render('<%= new Date() %>')
'Tue Aug 06 2019 11:31:50 GMT+0200 (CEST)'
> ejs.render('<%= Symbol("a") %>')
'Symbol(a)'
```

**EJS 2.6.2**
```
> ejs = require('ejs')
> ejs.render('<%= null %>')
''
> ejs.render('<%= undefined %>')
''
> ejs.render('<%= 0 %>')
'0'
> ejs.render('<%= {} %>')
'[object Object]'
> ejs.render('<%= [] %>')
''
> ejs.render('<%= "" %>')
''
> ejs.render('<%= true %>')
'true'
> ejs.render('<%= new Date() %>')
'Tue Aug 06 2019 11:31:54 GMT+0200 (CEST)'
> ejs.render('<%= Symbol("a") %>')
'Symbol(a)'
```
