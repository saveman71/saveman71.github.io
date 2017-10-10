---
layout: post
title:  "Cinnamon/Gnome Fix Alt+Shift+Tab problem"
date:   2017-10-10 21:08:42 +0200
categories:
---

Recently I found out that I was unable to properly cycle through my app switcher in Cinnamon: Alt+Tab worked properly, but Alt+Shift+Tab did not have any effect. It wasn't long before I found out that the shortcut was set to `unassigned`.

![So it doesn't work because the shortcut shows as unassigned](/assets/images/2017-09-03-cinnamon-gnome-fix-alt-shift-tab/screenshot-1.png){: max-width="80%" .screenshot}

The problem was, even if I tried to re-assign it to Alt+Shift+Tab as it was the case when it worked, the Shift key wouldn't register. Shift+Tab did work, Alt+Tab too, but not that particular keyboard shortcut.

Then I remembered that I set-up Alt+Shift to be a keyboard shortcut "à la Windows" to switch between keyboard layouts. Maybe that was it that was preventing me from using Alt+Shift in a shortcut, even if to my great regret, these particular shortcuts do work in Windows.

So I went to disable the *tweak* under **Keyboard > Layouts**:
 
![Keyboard > Layouts window](/assets/images/2017-09-03-cinnamon-gnome-fix-alt-shift-tab/screenshot-2.png){: max-width="80%" .screenshot}

And then open the advanced layout options by clicking the **Options...** button, that should open the following window.:

![Keyboard > Layouts > Options... window](/assets/images/2017-09-03-cinnamon-gnome-fix-alt-shift-tab/screenshot-3.png){: max-width="80%" .screenshot}

Locate the **Switching to another layout** item, expand it and see if you have the Alt+Shift item checked. That was the case for me, so I unchecked it.

I was than able to set Alt+Shift+Tab as a shortcut for the *Cycle backwards* options! 
