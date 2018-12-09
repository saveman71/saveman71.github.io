---
layout: post
title:  "Side by side content in LaTeX"
date:   2017-06-26 08:42:42 -0600
categories: latex
---

If there is one thing that keeps popping up in my LaTeX needs, it's the ability to put a block of text, a table, anything on a side of a page, and something else on the other side.

This is why I created this relatively small environment that basically just wraps two *minipages*, but considerably reduces the amount of code written in the final document:

{% raw %}
```latex
\usepackage{xparse}

% Two minipages side by side
% Provide the size of each minipage with two optional arguments
% First one defaults to .50 and second argument defaults to value of the first
\NewDocumentEnvironment{sidebyside}{O{.50} o +m +m}{%
  \noindent\begin{minipage}[t][][t]{#1\linewidth}%
  #3% Content of the first minipage
  \end{minipage}%
  \hfill%
  \noindent\begin{minipage}[t][][t]{\IfValueTF{#2}{#2}{#1}\linewidth}%
  #4% Content of the second minipage
  \end{minipage}\\% newline is important, it allows \hfill to work correctly, try removing it ;)
}
```
{% endraw %}

This code defines the environment `sidebyside`, which you can use in the following manner:

```latex
\sidebyside{Both sides\dotfill}{at 50\%\dotfill}

\sidebyside[.40]{Both sides\dotfill}{at 40\%\dotfill}

\sidebyside[.30][.70]{This side is 30\%\dotfill}{And this one 70\%\dotfill}

\sidebyside[.30][.65]{This side is 30\%\dotfill}{And this one 65\%, creating spacing\dotfill}
```

Enough writing, an image is worth a thousand words (colors and text where added afterwards, but the dimensions are the ones in the previous example):

![](/assets/images/2017-06-26-side-by-side-latex/side-by-side-latex.svg){: width="80%"}

The full code for this last example is:

{% raw %}
```latex
\documentclass[varwidth]{standalone}

\usepackage{xparse}

% Two minipages side by side
% Provide the size of each minipage with two optional arguments
% First one defaults to .50 and second argument defaults to value of the first
\NewDocumentEnvironment{sidebyside}{O{.50} o +m +m}{%
  \noindent\begin{minipage}[t][][t]{#1\linewidth}%
  #3% Content of the first minipage
  \end{minipage}%
  \hfill%
  \noindent\begin{minipage}[t][][t]{\IfValueTF{#2}{#2}{#1}\linewidth}%
  #4% Content of the second minipage
  \end{minipage}\\% newline is important, it allows \hfill to work correctly, try removing it ;)
}

\usepackage[usenames, dvipsnames]{color}
\usepackage[english]{babel}
\usepackage[pangram]{blindtext}

\begin{document}
  \sidebyside{\Blindtext[1][3]}{\noindent\color{Cerulean}\Blindtext[1][3]}

  \vspace{1cm}

  \sidebyside[.40]{\Blindtext[1][3]}{\noindent\color{Cerulean}\Blindtext[1][3]}

  \vspace{1cm}

  \sidebyside[.30][.70]{\Blindtext[1][3]}{\noindent\color{Cerulean}\Blindtext[1][3]}

  \vspace{1cm}

  \sidebyside[.30][.65]{\Blindtext[1][3]}{\noindent\color{Cerulean}\Blindtext[1][3]}
\end{document}
```
{% endraw %}

**Note:** If you are using LuaLaTeX and encounter errors with the `standalone` environment, [see this StackExchange](https://tex.stackexchange.com/a/315027/120111) answer.
