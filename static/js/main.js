// static/js/main.js
document.addEventListener('DOMContentLoaded', () => {
    // --- Referencias a elementos del DOM ---
    const loginSection = document.getElementById('loginSection');
    const mainContent = document.getElementById('mainContent');
    const loginButton = document.getElementById('loginButton');
    const guestLoginButton = document.getElementById('guestLoginButton');
    const logoutButton = document.getElementById('logoutButton');
    const sapEnvSelect = document.getElementById('sapEnvSelect');
    const sapClientInput = document.getElementById('sapClientInput');
    const sapUserInput = document.getElementById('sapUserInput');
    const sapPassInput = document.getElementById('sapPassInput');
    const useSapRouter = document.getElementById('useSapRouter');
    const loginStatus = document.getElementById('loginStatus');
    const loggedInUserDisplay = document.getElementById('loggedInUserDisplay');
    const clMovimientoInput = document.getElementById('clMovimientoInput');
    const almacenInput = document.getElementById('almacenInput');
    const centroInput = document.getElementById('centroInput');
    const textoCabeceraInput = document.getElementById('textoCabecera');
    const fechaContabInput = document.getElementById('fechaContabInput');
    const specialStockIndicatorInput = document.getElementById('specialStockIndicatorInput');
    const reservaCheckboxContainer = document.getElementById('reservaCheckboxContainer');
    const reservaCheckbox = document.getElementById('isReservaChecked');
    const readerDiv = document.getElementById('reader');
    const scanStatusElement = document.getElementById('scanStatus');
    const qrContentElement = document.getElementById('qrContent');
    const parsedDataElement = document.getElementById('parsedData');
    const msegTableBody = document.getElementById('msegTableBody');
    const resetButton = document.getElementById('resetButton');
    const saveButton = document.getElementById('saveButton');

    // --- Variables de estado ---
    let html5QrCode;
    let scannedCodes = new Map();
    let scanInProgress = false;
    let cooldownActive = false;
    const COOLDOWN_TIME = 2000; // 2 segundos
    let currentDocumentNumber = '';
    let currentDocumentYear = '';

    // --- Inicialización ---
    fechaContabInput.value = new Date().toISOString().slice(0, 10);

    // --- Funciones de Utilidad ---
    function setLoginStatus(message, type = 'info') {
        loginStatus.textContent = message;
        loginStatus.className = `mt-3 ${type}`; // success, error, warning
    }

    function setScanStatus(message, type = 'info') {
        scanStatusElement.textContent = message;
        scanStatusElement.className = `mt-2 text-center ${type}`;
    }

    function clearTable() {
        msegTableBody.innerHTML = '';
        scannedCodes.clear();
        resetButton.style.display = 'none';
        saveButton.style.display = 'none';
        currentDocumentNumber = '';
        currentDocumentYear = '';
    }

    // --- Lógica del Escáner ---
    async function startScanner() {
        if (scanInProgress || (html5QrCode && html5QrCode.isScanning)) return;
        scanInProgress = true;
        setScanStatus("Activando escáner...", 'info');
        readerDiv.classList.add('active');
        html5QrCode = new Html5Qrcode("reader");
        try {
            await html5QrCode.start({
                facingMode: "environment"
            }, {
                fps: 10,
                qrbox: (w, h) => ({ width: Math.min(w, h) * 0.8, height: Math.min(w, h) * 0.8 })
            }, onScanSuccess, (err) => { /* Silenciar errores continuos */ });
            setScanStatus("Escáner activo. Apunte la cámara a un código.", 'success');
        } catch (err) {
            setScanStatus(`Error al iniciar escáner: ${err}`, 'error');
            readerDiv.classList.remove('active');
            scanInProgress = false;
        }
    }

    async function stopScanner() {
        if (html5QrCode && html5QrCode.isScanning) {
            try {
                await html5QrCode.stop();
                setScanStatus("Escáner detenido.", 'info');
            } catch (err) {
                console.error("Error al detener escáner:", err);
            }
        }
        readerDiv.classList.remove('active');
        scanInProgress = false;
    }

    function checkHeaderFieldsAndToggleScanner() {
        const requiredFields = [clMovimientoInput, almacenInput, centroInput, fechaContabInput];
        const allFilled = requiredFields.every(field => field.value.trim() !== '');

        if (allFilled) {
            startScanner();
        } else {
            stopScanner();
            setScanStatus("Complete los campos de cabecera para activar el escáner.", 'warning');
        }
        toggleReservaCheckboxVisibility();
    }

    function toggleReservaCheckboxVisibility() {
        const clMovimiento = clMovimientoInput.value.trim();
        const specialStock = specialStockIndicatorInput.value.trim().toUpperCase();
        if (clMovimiento === '221' && specialStock === 'Q') {
            reservaCheckboxContainer.classList.add('visible');
        } else {
            reservaCheckboxContainer.classList.remove('visible');
            reservaCheckbox.checked = false;
        }
    }

    // --- Event Listeners de Cabecera ---
    [clMovimientoInput, specialStockIndicatorInput, almacenInput, centroInput, fechaContabInput].forEach(input => {
        input.addEventListener('input', checkHeaderFieldsAndToggleScanner);
    });

    // --- Procesamiento del QR ---
    function onScanSuccess(decodedText, decodedResult) {
        if (cooldownActive) return;

        setScanStatus("Código detectado. Procesando...", 'success');
        cooldownActive = true;
        qrContentElement.value = decodedText;

        try {
            const parsed = parseQrCode(decodedText);
            parsedDataElement.value = JSON.stringify(parsed, null, 2);
            const uniqueId = `${parsed.documentNumber}|${parsed.documentYear}|${parsed.item}`;

            if (!scannedCodes.has(uniqueId)) {
                getMsegDataFromSap(parsed);
            } else {
                setScanStatus("Este código ya fue escaneado.", 'warning');
            }
        } catch (e) {
            setScanStatus(`Error procesando QR: ${e.message}`, 'error');
        } finally {
            setTimeout(() => {
                cooldownActive = false;
                setScanStatus("Listo para escanear.", 'info');
            }, COOLDOWN_TIME);
        }
    }

    function parseQrCode(qrCode) {
        const parts = qrCode.split('|');
        if (parts.length < 5) throw new Error("Formato de QR inválido.");
        return {
            documentNumber: parts[0],
            documentYear: parts[1],
            item: parts[2],
            moveType: parts[3],
            specialStockIndicator: parts[4],
            sunmiLocation: parts[5] || ''
        };
    }

    // --- Llamadas a la API (Backend) ---
    async function getMsegDataFromSap(parsedQr) {
        try {
            const response = await fetch('/getMsegData', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(parsedQr)
            });
            const result = await response.json();

            if (result.success) {
                const msegData = result.msegData;
                msegData.SUNMI = parsedQr.sunmiLocation;
                const uniqueId = `${parsedQr.documentNumber}|${parsedQr.documentYear}|${parsedQr.item}`;
                scannedCodes.set(uniqueId, msegData);

                appendMsegRow(msegData);
                setScanStatus(`Datos de ${msegData.MBLNR}/${msegData.ZEILE} obtenidos.`, 'success');
                resetButton.style.display = 'block';
                saveButton.style.display = 'block';

                if (currentDocumentNumber === '') {
                    currentDocumentNumber = msegData.MBLNR;
                    currentDocumentYear = msegData.MJAHR;
                } else if (currentDocumentNumber !== msegData.MBLNR || currentDocumentYear !== msegData.MJAHR) {
                    setScanStatus("¡Advertencia! Documento o año diferente. Solo se procesará el primero.", 'warning');
                }
            } else {
                setScanStatus(`Error SAP: ${result.error}`, 'error');
                console.error("SAP Messages:", result.returnMessages);
            }
        } catch (error) {
            setScanStatus(`Error de red: ${error.message}`, 'error');
        }
    }

    function appendMsegRow(data) {
        const row = msegTableBody.insertRow();
        row.innerHTML = `
            <td>${msegTableBody.rows.length}</td>
            <td>${data.MATNR || ''}</td><td>${data.MAKTX || ''}</td><td>${data.CHARG || ''}</td>
            <td>${data.MENGE || ''}</td><td>${data.MEINS || ''}</td><td>${data.ZEILE || ''}</td>
            <td>${data.EBELN || ''}</td><td>${data.PS_PSP_PNR || ''}</td><td>${data.KDAUF || ''}</td>
            <td>${data.KDPOS || ''}</td><td>${data.SGTXT || ''}</td><td>${data.SUNMI || ''}</td>
            <td>${data.ZZUBICACION || ''}</td><td>${data.SUB_LOC || ''}</td>
        `;
    }

    saveButton.addEventListener('click', async () => {
        if (scannedCodes.size === 0) {
            alert("No hay datos para guardar.");
            return;
        }

        const headerData = {
            clMovimiento: clMovimientoInput.value.trim(),
            almacen: almacenInput.value.trim(),
            centro: centroInput.value.trim(),
            textoCabecera: textoCabeceraInput.value.trim(),
            fechaContab: fechaContabInput.value,
            specialStockIndicator: specialStockIndicatorInput.value.trim(),
            isReservaChecked: reservaCheckbox.checked
        };
        
        if (!headerData.clMovimiento || !headerData.almacen || !headerData.centro) {
            alert("Complete todos los campos de cabecera obligatorios.");
            return;
        }

        try {
            setScanStatus("Guardando en SAP...", 'info');
            const response = await fetch('/saveDataToSap', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ header: headerData, items: Array.from(scannedCodes.values()) })
            });
            const result = await response.json();

            if (result.success) {
                alert(`¡Datos guardados!\nDocumento SAP: ${result.sap_document_number}`);
                resetApplicationState();
            } else {
                alert(`Error al guardar en SAP:\n${result.error}\nMensajes: ${JSON.stringify(result.returnMessages, null, 2)}`);
                setScanStatus('Error al guardar.', 'error');
            }
        } catch (error) {
            alert(`Error de red al guardar: ${error.message}`);
            setScanStatus('Error de red.', 'error');
        }
    });

    resetButton.addEventListener('click', resetApplicationState);

    // --- Lógica de Login/Logout ---
    async function handleLogin(isGuest) {
        setLoginStatus('Conectando...', 'info');
        const env = sapEnvSelect.value;
        const env_map = {
            'DEV': { ahost: '172.16.16.11', sysnr: '00' },
            'QAS': { ahost: '172.16.16.10', sysnr: '00' },
            'PRD': { ahost: '172.16.16.32', sysnr: '00' }
        };

        let sap_config = {
            client: sapClientInput.value.trim(),
            ...env_map[env]
        };
        
        let endpoint = '/validateSapLogin';
        let userToDisplay = sapUserInput.value.trim();

        if (!isGuest) {
            sap_config.user = sapUserInput.value.trim();
            sap_config.passwd = sapPassInput.value.trim();
            sap_config.useSapRouter = useSapRouter.checked;
        } else {
            endpoint = '/validateGuestLogin';
            userToDisplay = 'Invitado';
        }

        try {
            const response = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sap_config })
            });
            const result = await response.json();

            if (result.success) {
                setLoginStatus('Login exitoso.', 'success');
                loggedInUserDisplay.textContent = `Usuario: ${userToDisplay} (${env})`;
                loginSection.style.display = 'none';
                mainContent.style.display = 'block';
                checkHeaderFieldsAndToggleScanner();
            } else {
                setLoginStatus(`Error de login: ${result.error}`, 'error');
            }
        } catch (error) {
            setLoginStatus(`Error de red: ${error.message}`, 'error');
        }
    }

    loginButton.addEventListener('click', () => handleLogin(false));
    guestLoginButton.addEventListener('click', () => handleLogin(true));
    logoutButton.addEventListener('click', () => {
        stopScanner();
        loginSection.style.display = 'block';
        mainContent.style.display = 'none';
        setLoginStatus('Sesión cerrada.', 'info');
        sapPassInput.value = '';
        resetApplicationState();
    });

    function resetApplicationState() {
        clearTable();
        qrContentElement.value = '';
        parsedDataElement.value = '';
        [clMovimientoInput, almacenInput, centroInput, textoCabeceraInput, specialStockIndicatorInput].forEach(i => i.value = '');
        fechaContabInput.value = new Date().toISOString().slice(0, 10);
        reservaCheckbox.checked = false;
        setScanStatus("Complete los campos de cabecera para activar el escáner.", 'warning');
        toggleReservaCheckboxVisibility();
    }
    
    // --- Estado Inicial de la App ---
    checkHeaderFieldsAndToggleScanner();
    toggleReservaCheckboxVisibility();
});