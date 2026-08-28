' Detiene Cronicas de Civilizacion cuando fue iniciado en modo oculto
' (jugar-oculto.vbs), donde no hay ventanas que cerrar a mano.
'
' Busca los procesos cmd.exe con los titulos CronicasBackend /
' CronicasFrontend / CronicasFrontendLan y los mata junto con sus procesos
' hijos (node.exe) usando taskkill /T. Sin el /T quedaria el node vivo
' ocupando el puerto y la proxima vez el juego no arrancaria.

Set WshShell = CreateObject("WScript.Shell")
Set wmi = GetObject("winmgmts:\\.\root\cimv2")

titulos = Array("CronicasBackend", "CronicasFrontend", "CronicasFrontendLan")
detenidos = ""

For Each titulo In titulos
    Set procesos = wmi.ExecQuery("SELECT ProcessId, CommandLine FROM Win32_Process WHERE Name = 'cmd.exe'")
    For Each p In procesos
        If Not IsNull(p.CommandLine) Then
            If InStr(p.CommandLine, "title " & titulo) > 0 Then
                WshShell.Run "taskkill /F /T /PID " & p.ProcessId, 0, True
                detenidos = detenidos & titulo & vbCrLf
            End If
        End If
    Next
Next

If detenidos = "" Then
    WshShell.Popup "No se encontro Cronicas corriendo en modo oculto." & vbCrLf & vbCrLf & _
                   "(si lo abriste con jugar.bat, cerra las 3 ventanas negras)", _
                   6, "Detener Cronicas", 48
Else
    WshShell.Popup "Cronicas detenido:" & vbCrLf & detenidos, 5, "Detener Cronicas", 64
End If
