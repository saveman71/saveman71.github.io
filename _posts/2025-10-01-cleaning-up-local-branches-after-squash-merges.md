---
layout: post
title: "Cleaning up local branches after squash merges"
date: 2025-10-01 13:12:42 +0100
categories: git branches cleanup squash merge
---

For years, I've been using this handy one-liner to clean up merged branches:

```bash
git branch --merged | grep -Ev "(^\*|^\+|production|develop|master)" | xargs git branch -d
```

It worked great: fetch the latest changes, run this command, and all the branches that had been merged would get deleted locally. Clean and simple.

# The Problem: Squash Merges Break Everything

Then we enabled squash merges on our team's repositories. Suddenly, my cleanup command stopped working. Because with squash merges, Git doesn't consider the original branch as "merged" in the traditional sense:

When you do a regular merge, Git creates a merge commit that has two parents - one from your branch and one from the target branch. The `git branch --merged` command can trace this history and knows your branch was incorporated.

With squash merges, Git takes all your commits, squashes them into a single new commit, and applies that to the target branch. Your original branch history is essentially discarded. From Git's perspective, your branch was never "merged" - the content was just copied over in a new commit and it has now way of knowing that it was ever merged.

`git branch --merged` then returns nothing, and you're left manually deleting branches or letting them pile up indefinitely. Although I'm keen on letting refactors get out of hand, stashes piling up, and working directory full of uncommitted utility files and tools, branches are the next (PRs are usually up there) best thing to track ongoing work. Having too much around makes the output of `git branch` pretty much useless and then you have to resort to sorting branches by date or some other criteria.

# A Better Solution

After getting frustrated with this a few too many times, I asked around my colleagues they just... don't care. Okay then. Let's turn to the internet: quick in our search we discover this Stack Overflow post:

[How can I delete all git branches which have been "Squash and Merge" via GitHub?](https://stackoverflow.com/a/56026209/2367848)

A oneliner that had some drawbacks stands out on the most upvoted answer:

```bash
git checkout -q master && git for-each-ref refs/heads/ "--format=%(refname:short)" | while read branch; do mergeBase=$(git merge-base master $branch) && [[ $(git cherry master $(git commit-tree $(git rev-parse "$branch^{tree}") -p $mergeBase -m _)) == "-"* ]] && git branch -D $branch; done

```

The core idea is sound ; it creates a synthetic commit that represents what your branch would look like if it were squash-merged, then uses `git cherry` to see if that commit already exists in the target branch. But it's not immediately obvious what's happening or why. It's hard to understand: If it breaks or behaves unexpectedly, you're in for a world of hurt.

If it worked 100% of the time, this article wouldn't exist. I don't remember the exact details but it wasn't enough. Also the lack of safety checks, and silent failures made it hard to debug.

So I took ideas from there and there, and wrote a script (with the help of Gemini 2.5, at the time) that could help automating the process further and be more resilient to errors than the above oneliner.

## Step 1: Find Remote Branches That Were Deleted

The script uses `git remote prune --dry-run` to see which remote tracking branches would be pruned:

```bash
deleted_on_remote=$(git remote prune $REMOTE_NAME --dry-run 2>&1 | grep '\[would prune\]' | awk '{print $NF}' | sed "s#^$REMOTE_NAME/##")
```

This gives us a list of branch names that exist locally but have been deleted on the remote. The nice thing is that this is repeatable. The `--dry-run` flag makes the prune operation a noop so the script is repeatable.

## Step 2: Verify Before Deleting

A remote branch deleted doesn't mean we should automatically delete the local version. What if there are local changes that weren't pushed?

For each branch marked for deletion, it:

1. Switches to the branch
2. Tries to merge it with `develop` 
3. If the merge results in no changes (meaning the branch content was already squash-merged), it's safe to delete
4. If there are differences, it skips deletion and warns you

```bash
git switch "$branch"
git merge develop --no-edit --quiet || {
    echo "Merge failed for $branch, skipping deletion."
    continue
}

if ! git diff --quiet develop; then
    echo "Branch $branch has differences with develop, skipping deletion."
    continue
fi
```

## Safety Features

The script includes several safety features:

- Autostash: Automatically stashes any uncommitted changes before starting, and pops them when done (or when something goes haywire)
- Current branch protection: Never deletes the branch you're currently on
- Confirmation prompt: Shows you exactly which branches will be deleted and asks for confirmation

# The Complete Script

Here's the full script that you can drop into your project:

```bash
#!/bin/bash

# --- Configuration ---
REMOTE_NAME="origin" # Change if your remote has a different name

# --- Colors ---
RED='\033[0;31m'
YELLOW='\033[1;33m' # For warnings or info
NC='\033[0m' # No Color

# --- Autostash Setup ---
stash_created=false
# Function to pop the stash if it was created by this script
pop_stash() {
  if [ "$stash_created" = true ]; then
    echo "-----------------------------"
    echo -e "${YELLOW}Popping autostash...${NC}"
    git stash pop || echo -e "${RED}Warning: 'git stash pop' failed. You may need to resolve conflicts manually.${NC}"
  fi
}
# Set a trap to ensure pop_stash is called on any script exit (normal, error, or user abort)
trap pop_stash EXIT

# --- Safety Check: Ensure we are in a git repository ---
if ! git rev-parse --is-inside-work-tree > /dev/null 2>&1; then
  echo -e "${RED}Error: Not inside a Git repository.${NC}"
  exit 1
fi

# --- Autostash Execution ---
# Check for uncommitted changes (staged or unstaged)
if ! git diff-index --quiet HEAD --; then
  echo -e "${YELLOW}Uncommitted changes detected. Creating an autostash...${NC}"
  git stash push -m "autostash-by-cleanup-script-$(date +%s)"
  stash_created=true
  echo "-----------------------------"
fi

echo "Checking for local branches whose remote tracking branches on '$REMOTE_NAME' have been deleted..."

# --- Step 1: Get list of remote branches deleted on the specified remote ---
# Use 'git remote prune --dry-run' which is designed for this.
# Output is like: * [would prune] origin/branch-name
# We extract the part after 'origin/'
deleted_on_remote_raw=$(git remote prune $REMOTE_NAME --dry-run 2>&1)
if [[ $? -ne 0 ]]; then
    echo -e "${RED}Error checking remote prune status. Output:${NC}"
    echo "$deleted_on_remote_raw"
    exit 1
fi

deleted_on_remote=$(echo "$deleted_on_remote_raw" | grep '\[would prune\]' | awk '{print $NF}' | sed "s#^$REMOTE_NAME/##")

if [[ -z "$deleted_on_remote" ]]; then
  echo "No remote branches seem to have been deleted on '$REMOTE_NAME' since last fetch/prune."
  # Optional: Still run fetch -p to actually prune remote refs if needed
  # echo "Running 'git fetch -p' to update remote refs..."
  # git fetch -p $REMOTE_NAME
  exit 0
fi

# --- Step 2: Get list of local branches ---
# Use plumbing 'git for-each-ref' for robustness
local_branches=$(git for-each-ref --format='%(refname:short)' refs/heads/)

# --- Step 3: Get the current branch ---
# Use plumbing 'git symbolic-ref'
current_branch=$(git symbolic-ref --short HEAD 2>/dev/null) || current_branch=""

# --- Step 4: Compare and identify local branches to potentially delete ---
declare -a branches_to_delete # Array to hold branches marked for deletion
declare -a branches_to_display # Array to hold display lines

echo "Comparing with local branches:"
echo "-----------------------------"

has_branches_to_delete=false

while IFS= read -r local_branch; do
  # Ignore the current branch - never delete it automatically
  if [[ "$local_branch" == "$current_branch" ]]; then
    branches_to_display+=("* ${local_branch} (current branch)")
    continue
  fi

  # Check if this local branch exists in the list of deleted remote branches
  # Use grep -Fxq for exact, fixed string, quiet match within the list
  if grep -Fxq "$local_branch" <<< "$deleted_on_remote"; then
    # Found a match - mark for deletion
    branches_to_display+=("- ${RED}${local_branch} (remote deleted)${NC}")
    branches_to_delete+=("$local_branch")
    has_branches_to_delete=true
  else
    # No match - just display normally
    branches_to_display+=("  ${local_branch}")
  fi
done <<< "$local_branches"

# --- Step 5: Display the list ---
if [ ${#branches_to_display[@]} -eq 0 ]; then
    echo "No local branches found."
    exit 0
fi

# Print the collected display lines
for line in "${branches_to_display[@]}"; do
  echo -e "$line"
done
echo "-----------------------------"


# --- Step 6: Check if any branches are marked for deletion ---
if ! $has_branches_to_delete; then
  echo "No local branches correspond to deleted remote branches."
  # Optional: Run fetch -p here if you want to ensure pruning happens even if no local match
  # echo "Running 'git fetch -p' to update remote refs..."
  # git fetch -p $REMOTE_NAME
  exit 0
fi

echo # Newline for clarity before prompt

# --- Step 7: Ask for confirmation ---
# Use '-ei "y"' in read for bash >= 4 (default to 'y')
# Fallback for older bash
read -p "$(echo -e Are you sure you want to delete the ${RED}RED${NC} local branches listed above? \(y/N\):) " response
response_lower=$(echo "$response" | tr '[:upper:]' '[:lower:]') # portable lowercase

# --- Step 8: Perform deletion if confirmed ---
if [[ "$response_lower" == "y" ]]; then
  echo "Proceeding with deletion..."
  deleted_count=0
  error_count=0
  # Actually prune the remote tracking refs first
  # echo "Running 'git fetch -p $REMOTE_NAME' to sync remote refs..."
  # git fetch -p $REMOTE_NAME

  echo "Deleting local branches..."
  for branch in "${branches_to_delete[@]}"; do
    echo -n "Deleting local branch '$branch'... "
    # Use 'git branch -d' (porcelain, but standard and safer as it checks for merged status)
    # Use 'git branch -D' for force deletion if desired.

    git switch "$branch"
    git merge develop --no-edit --quiet || {
      echo -e "${RED}Merge failed for $branch, skipping deletion.${NC}"
      git merge --abort
      ((error_count++))
      continue
    }
    # check if we have some difference with develop
    if ! git diff --quiet develop; then
      # assert slate is pristine before --hard reset
      if ! git diff --quiet; then
        echo -e "${RED}Local changes detected in $branch, aborting merge.${NC}"
        continue
      fi
      git reset --hard HEAD~1
      echo -e "${YELLOW}Branch $branch has differences with develop, skipping deletion.${NC}"
      ((error_count++))
      continue
    fi

    git switch develop

    if git branch -D "$branch"; then
      echo -e "${YELLOW}Deleted.${NC}"
      ((deleted_count++))
    else
      echo -e "${RED}Failed for $branch.${NC}"
      ((error_count++))
    fi
  done
  echo "-----------------------------"
  echo "Deletion complete. $deleted_count branches deleted."
  if [[ $error_count -gt 0 ]]; then
      echo -e "${RED}$error_count branches failed to delete (see messages above).${NC}"
      exit 1 # Exit with error status if deletions failed
  fi
else
  echo "Aborted by user. No local branches were deleted."
  echo "You might still want to run 'git fetch -p $REMOTE_NAME' to prune remote-tracking references."
fi

exit 0
```
