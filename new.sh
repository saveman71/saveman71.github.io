#!/bin/bash

set -ex

slugify() {
  echo "$1" | iconv -t ascii//TRANSLIT | sed -E -e 's/[^[:alnum:]]+/-/g' -e 's/^-+|-+$//g' | tr '[:upper:]' '[:lower:]'
}

target="_posts/$(date --iso-8601=date)-$(slugify "$1").md"

# Copy template
cp template.md $target

# Basic templating
sed -i "s/{{DATE}}/$(date --iso-8601=seconds)/g" $target
sed -i "s/{{TITLE}}/${1}/g" $target

subl $target
