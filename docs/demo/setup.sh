# Sourced by docs/demo.tape from the repository root. Sets a short prompt, makes `surviving-lines`
# run this checkout, and builds the "split" fixture (one person on two addresses) for --identities.
PS1='$ '
alias surviving-lines="node $PWD/bin/surviving-lines.js"
SPLIT=$(node "$PWD/docs/demo/make-split.mjs")
export SPLIT
