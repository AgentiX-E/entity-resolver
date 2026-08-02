#!/bin/bash
# Push all local I31-I34 commits to GitHub.
# Run this from the entity-resolver repo root on a machine with git access.
set -e
echo "Pushing 5 commits to AgentiX-E/entity-resolver..."
git push origin master
echo "Done. Verify at: https://github.com/AgentiX-E/entity-resolver"
