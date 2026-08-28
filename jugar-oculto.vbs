' Arranca Cronicas de Civilizacion (backend + los dos frontends) en segundo
' plano, SIN ventanas negras. Equivalente oculto de jugar.bat.
'
' Si ya esta corriendo (por ejemplo, clickeaste el icono dos veces), NO vuelve
' a lanzar nada: te avisa y listo, para no dejar servidores duplicados peleando
' por el mismo puerto.
'
' Para pararlo: detener-cronicas.vbs (mata los 3 por titulo de ventana, aunque
' esten ocultos).
'
' Como las ventanas no se ven, la salida de cada proceso va a un archivo dentro
' de logs\. Si algo falla, el motivo esta ahi. Y si preferis verlo en vivo,
' jugar.bat sigue existiendo y abre las 3 ventanas como siempre.

Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

projectDir = fso.GetParentFolderName(WScript.ScriptFullName)
logDir = projectDir & "\logs"
If Not fso.FolderExists(logDir) Then fso.CreateFolder(logDir)

Function YaEstaCorriendo(tituloVentana)
    Dim wmi, procesos, p
    Set wmi = GetObject("winmgmts:\\.\root\cimv2")
    Set procesos = wmi.ExecQuery("SELECT CommandLine FROM Win32_Process WHERE Name = 'cmd.exe'")
    YaEstaCorriendo = False
    For Each p In procesos
        If Not IsNull(p.CommandLine) Then
            If InStr(p.CommandLine, "title " & tituloVentana) > 0 Then
                YaEstaCorriendo = True
                Exit Function
            End If
        End If
    Next
End Function

If YaEstaCorriendo("CronicasBackend") Then
    WshShell.Popup "Cronicas ya esta corriendo. No se lanzo nada nuevo." & vbCrLf & vbCrLf & _
                   "Abrilo en: https://localhost:5173", 6, "Cronicas de Civilizacion", 48
    WScript.Quit
End If

' 0 = ventana oculta, False = no esperar a que termine (los 3 en paralelo).
' El titulo es lo que despues permite encontrarlos y matarlos aunque no se vean.
WshShell.Run "cmd /c title CronicasBackend && cd /d """ & projectDir & "\backend"" && yarn dev-sqlite > """ & logDir & "\backend.log"" 2>&1", 0, False

WshShell.Run "cmd /c title CronicasFrontend && cd /d """ & projectDir & "\frontend"" && yarn dev > """ & logDir & "\frontend.log"" 2>&1", 0, False

' Segunda instancia por HTTP para la tablet y el celular: no confian en la CA
' local de mkcert, asi que por HTTPS no entran.
WshShell.Run "cmd /c title CronicasFrontendLan && cd /d """ & projectDir & "\frontend"" && set SIN_HTTPS=1 && node_modules\.bin\vite.cmd --port 5174 --strictPort > """ & logDir & "\frontend-lan.log"" 2>&1", 0, False

' Los servidores tardan unos segundos en levantar; abrir el navegador antes
' muestra un error de conexion y asusta al pedo.
WScript.Sleep 10000
WshShell.Run "https://localhost:5173", 1, False

WshShell.Popup "Cronicas de Civilizacion iniciado." & vbCrLf & vbCrLf & _
               "En esta PC:            https://localhost:5173" & vbCrLf & _
               "En tablet o celular:   http://192.168.3.6:5174" & vbCrLf & _
               "(si esa IP no anda, cambio: abri una ventana negra y escribi ipconfig)" & vbCrLf & vbCrLf & _
               "Para cerrarlo: el acceso directo 'Detener Cronicas'.", _
               8, "Cronicas de Civilizacion", 64
