' Arranca Cronicas de Civilizacion (backend + los dos frontends) en segundo
' plano, SIN ventanas negras. Equivalente oculto de jugar.bat.
'
' Si ya esta corriendo (por ejemplo, clickeaste el icono dos veces), NO vuelve
' a lanzar nada: te avisa y listo, para no dejar servidores duplicados peleando
' por el mismo puerto.
'
' "Ya esta corriendo" se decide preguntandole al SERVIDOR si contesta, no
' mirando si existe una ventana con el titulo correcto. Cuando el backend
' crashea, su cmd sobrevive vacio: mirando titulos, el icono quedaba inservible
' (avisaba "ya esta corriendo", no levantaba nada, y no habia como enterarse
' salvo abrir el navegador y ver que no cargaba). Si quedaron cascaras muertas,
' ahora las limpia solo y arranca. Visto y arreglado el 2026-09-04.
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

TITULOS = Array("CronicasBackend", "CronicasFrontend", "CronicasFrontendLan")

' Hay una ventana (oculta) con ese titulo. Ojo: esto NO significa que el juego
' funcione. El cmd es solo la cascara; si el node de adentro murio, la cascara
' sigue viva igual. Sirve para saber que hay que limpiar, no para saber si anda.
Function HayCascara(tituloVentana)
    Dim wmi, procesos, p
    Set wmi = GetObject("winmgmts:\\.\root\cimv2")
    Set procesos = wmi.ExecQuery("SELECT CommandLine FROM Win32_Process WHERE Name = 'cmd.exe'")
    HayCascara = False
    For Each p In procesos
        If Not IsNull(p.CommandLine) Then
            If InStr(p.CommandLine, "title " & tituloVentana) > 0 Then
                HayCascara = True
                Exit Function
            End If
        End If
    Next
End Function

Function HayCascaras()
    Dim t
    HayCascaras = False
    For Each t In TITULOS
        If HayCascara(t) Then
            HayCascaras = True
            Exit Function
        End If
    Next
End Function

' Mismo taskkill que detener-cronicas.vbs. El /T es imprescindible: el cmd es
' el padre, y quien ocupa el puerto es el node hijo.
Sub LimpiarCascaras()
    Dim wmi, procesos, p, t
    Set wmi = GetObject("winmgmts:\\.\root\cimv2")
    For Each t In TITULOS
        Set procesos = wmi.ExecQuery("SELECT ProcessId, CommandLine FROM Win32_Process WHERE Name = 'cmd.exe'")
        For Each p In procesos
            If Not IsNull(p.CommandLine) Then
                If InStr(p.CommandLine, "title " & t) > 0 Then
                    WshShell.Run "taskkill /F /T /PID " & p.ProcessId, 0, True
                End If
            End If
        Next
    Next
End Sub

' Caso 1: el juego contesta de verdad. No relanzar nada.
If ServidorListo("https://localhost:5173") Then
    WshShell.Popup "Cronicas ya esta corriendo. No se lanzo nada nuevo." & vbCrLf & vbCrLf & _
                   "Abrilo en: https://localhost:5173", 6, "Cronicas de Civilizacion", 48
    WshShell.Run "https://localhost:5173", 1, False
    WScript.Quit
End If

' Caso 2: hay cascaras pero nadie contesta. Puede ser un arranque EN CURSO (si
' hiciste doble clic, la primera instancia todavia esta levantando) o restos de
' una instancia muerta. Se distingue esperando: si en 45 segundos no contesta,
' estaba muerta. Matarlas de una seria matar un arranque sano.
If HayCascaras() Then
    esperaRestos = 0
    Do While Not ServidorListo("https://localhost:5173") And esperaRestos < 45
        WScript.Sleep 1000
        esperaRestos = esperaRestos + 1
    Loop

    If ServidorListo("https://localhost:5173") Then
        WshShell.Popup "Cronicas ya estaba arrancando. Ya esta listo." & vbCrLf & vbCrLf & _
                       "Abrilo en: https://localhost:5173", 6, "Cronicas de Civilizacion", 48
        WshShell.Run "https://localhost:5173", 1, False
        WScript.Quit
    End If

    LimpiarCascaras
End If

' 0 = ventana oculta, False = no esperar a que termine (los 3 en paralelo).
' El titulo es lo que despues permite encontrarlos y matarlos aunque no se vean.
WshShell.Run "cmd /c title CronicasBackend && cd /d """ & projectDir & "\backend"" && yarn dev-sqlite > """ & logDir & "\backend.log"" 2>&1", 0, False

WshShell.Run "cmd /c title CronicasFrontend && cd /d """ & projectDir & "\frontend"" && yarn dev > """ & logDir & "\frontend.log"" 2>&1", 0, False

' Segunda instancia por HTTP para la tablet y el celular: no confian en la CA
' local de mkcert, asi que por HTTPS no entran.
WshShell.Run "cmd /c title CronicasFrontendLan && cd /d """ & projectDir & "\frontend"" && set SIN_HTTPS=1 && node_modules\.bin\vite.cmd --port 5174 --strictPort > """ & logDir & "\frontend-lan.log"" 2>&1", 0, False

' Esperar a que el servidor CONTESTE, no una cantidad fija de segundos: con una
' espera de 10 segundos el navegador llegaba primero y mostraba
' ERR_CONNECTION_REFUSED (visto por el usuario dos veces seguidas). Vite tarda
' mas cuando arranca por HTTPS, y en una PC ocupada mas todavia, asi que
' cualquier numero fijo iba a fallar tarde o temprano.
'
' ServerXMLHTTP con setOption(2, 13056) ignora los errores de certificado: el
' certificado local de mkcert no tiene por que ser valido para este chequeo, lo
' unico que se pregunta es "¿ya hay alguien atendiendo?".
Function ServidorListo(url)
    Dim http
    ServidorListo = False
    On Error Resume Next
    Set http = CreateObject("MSXML2.ServerXMLHTTP.6.0")
    http.setOption 2, 13056
    http.setTimeouts 2000, 2000, 2000, 2000
    http.open "GET", url, False
    http.send
    If Err.Number = 0 Then ServidorListo = True
    Err.Clear
    On Error GoTo 0
End Function

esperados = 0
Do While Not ServidorListo("https://localhost:5173") And esperados < 90
    WScript.Sleep 1000
    esperados = esperados + 1
Loop

If esperados >= 90 Then
    WshShell.Popup "El juego no termino de arrancar despues de 90 segundos." & vbCrLf & vbCrLf & _
                   "Mira que dice logs\backend.log o logs\frontend.log, o abri jugar.bat " & _
                   "para ver las ventanas en vivo.", 12, "Cronicas de Civilizacion", 48
    WScript.Quit
End If

WshShell.Run "https://localhost:5173", 1, False

WshShell.Popup "Cronicas de Civilizacion iniciado." & vbCrLf & vbCrLf & _
               "En esta PC:            https://localhost:5173" & vbCrLf & _
               "En tablet o celular:   http://192.168.3.6:5174" & vbCrLf & _
               "(si esa IP no anda, cambio: abri una ventana negra y escribi ipconfig)" & vbCrLf & vbCrLf & _
               "Para cerrarlo: el acceso directo 'Detener Cronicas'.", _
               8, "Cronicas de Civilizacion", 64
