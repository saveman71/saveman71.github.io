---
layout: post
title:  "A simple Sublime Text plugin to copy a file path from the project root"
date:  2024-03-11 13:12:42 +0100
categories: sublimetext sublime plugin python clipboard project root relative
---

A few days ago, the author of
[`SideBarEnhancements`](https://packagecontrol.io/packages/SideBarEnhancements) slimmed down his
package removing a lot of functionnality. One I used many times per day was the ability to copy a
file path from the project root to then use in various commands such as `mix test <filepath>`, etc.

I wanted to create a standalone plugin that provided similar functionnality. Hopefully, this is
quite simple to do:

We'll need to:

* write a Python script that Sublime Text can execute as a plugin
* create a command palette entry for it

## Creating the Python Plugin

Open Sublime Text and go to `Tools` > `Developer` > `New Plugin...`. This will open a new tab with
a template for a new plugin. Then we'll add the following:

```python
import sublime
import sublime_plugin
import os

class CopyPathFromProjectRootCommand(sublime_plugin.TextCommand):
    def run(self, edit):
        # Get the current file path
        file_path = self.view.file_name()
        if not file_path:
            sublime.status_message("No file to copy path from.")
            return
        
        # Find the project root
        window = self.view.window()
        folders = window.folders()
        project_root = None
        for folder in folders:
            if file_path.startswith(folder):
                project_root = folder
                break
        
        if not project_root:
            sublime.status_message("File is not in any of the loaded projects.")
            return
        
        # Get the relative path from project root and copy it to clipboard
        relative_path = os.path.relpath(file_path, project_root)
        sublime.set_clipboard(relative_path)
        sublime.status_message("Path copied to clipboard: " + relative_path)
```

Save the file (if you created the file using the above menu, it should already be in the right
folder, `User`).

## Creating an entry in the command palette

Create a new file named `CopyPathFromProjectRoot.sublime-commands` in the same folder, and add the
following JSON code to this file:

```json
[
    {
        "caption": "Copy Path From Project Root",
        "command": "copy_path_from_project_root"
    }
]
```

## Usage

You now have a new command in the command palette, `Copy Path From Project Root`. You can use it to
copy the relative path of the current file to the clipboard. That's it!

You can also bind the command to a key combination, for example:

```json
{
    "keys": ["ctrl+shift+c"],
    "command": "copy_path_from_project_root"
}
```

(add this to your user keybindings file)
