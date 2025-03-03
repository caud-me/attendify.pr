
Gui, Font, s20 Bold
Gui, Add, Text, x60 y20, Attendify
Gui, Add, Progress, x20 y60 w250 h20 cGreen vProgress, 0
Gui, Add, Text, x135 y85 vPercent, 50٪

Gui, Show, w300 h120, Attendify

; Run backend processes while showing the UI
Run, cmd /c cd backend && npx nodemon index.js,, Hide
Run, cmd /c python server.py,, Hide

ProgressValue := 0

Loop, 50
{
    ProgressValue += 2  ; Increase progress by 2% each loop
    GuiControl,, Progress, %ProgressValue%  ; Update progress bar
    GuiControl,, Percent, %ProgressValue%％  ; Update text with fullwidth percent sign
    Sleep, 100  ; Delay for smooth progress
}

Run, http://localhost:3000

; Wait 2 seconds before closing the UI
Sleep, 2000
ExitApp
