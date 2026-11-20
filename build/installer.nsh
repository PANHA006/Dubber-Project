; Custom NSIS Installer & Uninstaller Script for FREE Dubber Pro
; Provides professional modal prompts and deep cleanup upon uninstall

!macro customUnInstall
  MessageBox MB_YESNO|MB_ICONQUESTION "តើអ្នកចង់លុបសម្អាតទិន្នន័យវីដេអូ, ឯកសារសំឡេង AI និង Cache ទាំងអស់របស់ FREE Dubber Pro ដែរឬទេ?$\r$\n(Do you want to purge all temporary project files, AI voices and cached data?)" IDNO skipCleanStorage
    RMDir /r "$APPDATA\FREE Dubber Pro"
    RMDir /r "$APPDATA\free-dubber-pro"
    RMDir /r "$INSTDIR\storage"
  skipCleanStorage:
!macroend
