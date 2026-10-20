# Recorded with vhs 0.12.1. Regenerate from the repository root: vhs docs/demo.tape
# Scene 1 and 2 run on this repository, scene 3 on a synthetic fixture (docs/demo/make-split.mjs).
Output docs/demo.gif
Set Shell "bash"
Set FontSize 15
Set Width 1100
Set Height 600
Set Padding 14
Set Framerate 12
Set TypingSpeed 45ms
Set Theme "Dracula"

Hide
Type "source docs/demo/setup.sh && clear"
Enter
Show

Type "surviving-lines -q --top 4"
Enter
Sleep 5s

Type "clear"
Enter
Type "surviving-lines -q --group-by dir --top 2 | head -16"
Enter
Sleep 5s

Type "clear"
Enter
Type "cd $SPLIT && surviving-lines -q --identities"
Enter
Sleep 6s
