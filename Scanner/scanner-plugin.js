//////////////////////////////////////////////////////////////////////////////////////
///                                                                                ///
///  SCANNER SCRIPT FOR FM-DX-WEBSERVER (V1.2)              last update: 14.06.24  ///
///                                                                                /// 
///  by Highpoint                                                                  ///
///  mod by PE5PVB - Will only work with PE5PVB ESP32 firmware                     ///     
///                                                                                ///
///  https://github.com/Highpoint2000/webserver-scanner                            ///
///                                                                                ///
//////////////////////////////////////////////////////////////////////////////////////

const isESP32WithPE5PVB = true;  // Set to true if ESP32 with PE5PVB firmware is being used

//////////////////////////////////////////////////////////////////////////////////////

(() => {
    const scannerPlugin = (() => {   

        let scanInterval;
        let currentFrequency = 0.0;
        let previousFrequency = null;
        let previousPiCode = null;
        let isScanning = false;
        let frequencySocket = null;
        let piCode = '?';

        const localHost = window.location.host;
        const wsUrl = `ws://${localHost}/text`;

        function setupWebSocket() {
            // WebSocket setup
            if (!isESP32WithPE5PVB) {
                if (!frequencySocket || frequencySocket.readyState === WebSocket.CLOSED) {
                    frequencySocket = new WebSocket(wsUrl);

                    frequencySocket.addEventListener("open", () => {
                        console.log("WebSocket connected.");
                    });

                    frequencySocket.addEventListener("error", (error) => {
                        console.error("WebSocket error:", error);
                    });

                    frequencySocket.addEventListener("close", () => {
                        console.log("WebSocket closed.");
                        // Try to reconnect
                        setTimeout(setupWebSocket, 1000);
                    });
                }
            }
        }

        function sendDataToClient(frequency) {
            // Send data via WebSocket
            if (frequencySocket && frequencySocket.readyState === WebSocket.OPEN) {
                const dataToSend = `T${(frequency * 1000).toFixed(0)}`;
                frequencySocket.send(dataToSend);
                console.log("WebSocket sent:", dataToSend);
            } else {
                console.error('WebSocket not open.');
                setTimeout(() => sendDataToClient(frequency), 500); // Retry after a short delay
            }
        }

        // Function to send a command to the client via WebSockets
        function sendCommandToClient(command) {
            // Determine the WebSocket protocol based on the current page
            const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            // Determine the host of the current page
            const host = window.location.host;
            // Construct the WebSocket URL
            const wsUrl = `${protocol}//${host}/text`;

            // Create a WebSocket connection to the specified URL
            const autoScanSocket = new WebSocket(wsUrl);

            // Event listener for opening the WebSocket connection
            autoScanSocket.addEventListener("open", () => {
                console.log("WebSocket connected.");
                // Send the command via the WebSocket connection
                console.log("Sending command:", command);
                autoScanSocket.send(command);
            });

            // Event listener for WebSocket errors
            autoScanSocket.addEventListener("error", (error) => {
                console.error("WebSocket error:", error);
            });

            // Event listener for receiving a message from the server
            autoScanSocket.addEventListener("message", (event) => {
                // Close the WebSocket connection after receiving the response
                autoScanSocket.close();
            });

            // Event listener for closing the WebSocket connection
            autoScanSocket.addEventListener("close", () => {
                console.log("WebSocket closed.");
            });
        }

        function waitForServer() {
            // Wait for the server to be available
            if (typeof window.socket !== "undefined") {
                window.socket.addEventListener("message", (event) => {
                    const parsedData = JSON.parse(event.data);
                    const newPiCode = parsedData.pi;
                    const freq = parsedData.freq;

                    if (newPiCode !== previousPiCode) {
                        previousPiCode = newPiCode;
                        if (!isESP32WithPE5PVB) {
                            checkPiCode(newPiCode);
                        }
                    }

                    if (freq !== previousFrequency) {
                        previousFrequency = freq;
                    }

                    currentFrequency = freq;
                });
            } else {
                console.error('Socket is not defined.');
                setTimeout(waitForServer, 250);
            }
        }

        waitForServer();

        function startScan(direction) {
            // Start scanning in the specified direction
            console.log('Scan started in direction:', direction);

            if (isScanning) {
                clearInterval(scanInterval);
                console.log('Previous scan stopped.');
            }

            const tuningRangeText = document.querySelector('#tuner-desc .color-4').innerText;
            const tuningLowerLimit = parseFloat(tuningRangeText.split(' MHz')[0]);
            const tuningUpperLimit = parseFloat(tuningRangeText.split(' MHz')[1].split(' - ')[1]);

            if (isNaN(currentFrequency) || currentFrequency === 0.0) {
                currentFrequency = tuningLowerLimit;
            }

            function updateFrequency() {
                currentFrequency = Math.round(currentFrequency * 10) / 10; // Round to one decimal place
                if (direction === 'up') {
                    currentFrequency += 0.1;
                    if (currentFrequency > tuningUpperLimit) {
                        currentFrequency = tuningLowerLimit;
                    }
                } else if (direction === 'down') {
                    currentFrequency -= 0.1;
                    if (currentFrequency < tuningLowerLimit) {
                        currentFrequency = tuningUpperLimit;
                    }
                }

                currentFrequency = Math.round(currentFrequency * 10) / 10;
                console.log("Current frequency:", currentFrequency);
                sendDataToClient(currentFrequency);
            }

            piCode = '?';
            updateFrequency();
            isScanning = true;
            scanInterval = setInterval(updateFrequency, 500);
            console.log('New scan started.');
        }

        function checkPiCode(receivedPiCode) {
            // Check if the received Pi code is valid
            if (receivedPiCode.length > 1) {
                clearInterval(scanInterval);
                isScanning = false;
                piCode = '?';
                console.log('Scan aborted because the Pi code has more than one character.');
            }
        }

        function restartScan(direction) {
            // Restart scanning in the specified direction
            console.log('Restarting scan in direction:', direction);
            clearInterval(scanInterval);
            isScanning = false;
            piCode = '?';
            setTimeout(() => startScan(direction), 150);
        }

        function ScannerButtons() {
            // Create buttons for controlling the scanner
            const scannerDownButton = document.createElement('button');
            scannerDownButton.id = 'scanner-down';
            scannerDownButton.setAttribute('aria-label', 'Scan Down');
            scannerDownButton.classList.add('rectangular-downbutton');
            scannerDownButton.innerHTML = '<i class="fa-solid fa-chevron-left"></i><i class="fa-solid fa-chevron-left"></i>';

            const scannerUpButton = document.createElement('button');
            scannerUpButton.id = 'scanner-up';
            scannerUpButton.setAttribute('aria-label', 'Scan Up');
            scannerUpButton.classList.add('rectangular-upbutton');
            scannerUpButton.innerHTML = '<i class="fa-solid fa-chevron-right"></i><i class="fa-solid fa-chevron-right"></i>';

            const rectangularButtonStyle = `
                .rectangular-downbutton {
                    border: 3px solid #ccc;
                    border-radius: 0px;
                    padding: 5px 10px;
                    background-color: #fff;
                    color: #333;
                    cursor: pointer;
                    transition: background-color 0.3s, color 0.3s, border-color 0.3s;
                    margin-left: 1px;
                }

                .rectangular-upbutton {
                    border: 3px solid #ccc;
                    border-radius: 0px;
                    padding: 5px 10px;
                    background-color: #fff;
                    color: #333;
                    cursor: pointer;
                    transition: background-color 0.3s, color 0.3s, border-color 0.3s;
                    margin-right: 1px;
                }

                .rectangular-button:hover {
                    background-color: #f0f0f0;
                    border-color: #aaa;
                }
            `;

            const styleElement = document.createElement('style');
            styleElement.innerHTML = rectangularButtonStyle;
            document.head.appendChild(styleElement);

            const freqDownButton = document.getElementById('freq-down');
            freqDownButton.parentNode.insertBefore(scannerDownButton, freqDownButton.nextSibling);

            const freqUpButton = document.getElementById('freq-up');
            freqUpButton.parentNode.insertBefore(scannerUpButton, freqUpButton);

            if (isESP32WithPE5PVB) {
                scannerDownButton.addEventListener('click', function () {
                    sendCommandToClient('C1');
                });

                scannerUpButton.addEventListener('click', function () {
                    sendCommandToClient('C2');
                });
            } else {
                scannerDownButton.addEventListener('click', function () {
                    restartScan('down');
                });

                scannerUpButton.addEventListener('click', function () {
                    restartScan('up');
                });
            }
        }

        // WebSocket and scanner button initialization
        setupWebSocket();
        ScannerButtons();
    })();

    // Function to send a command to the client via WebSockets
    function sendCommandToClient(command) {
        // Determine the WebSocket protocol based on the current page
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        // Determine the host of the current page
        const host = window.location.host;
        // Construct the WebSocket URL
        const wsUrl = `${protocol}//${host}/text`;

        // Create a WebSocket connection to the specified URL
        const autoScanSocket = new WebSocket(wsUrl);

        // Event listener for opening the WebSocket connection
        autoScanSocket.addEventListener("open", () => {
            console.log("WebSocket connected.");
            // Send the command via the WebSocket connection
            console.log("Sending command:", command);
            autoScanSocket.send(command);
        });

        // Event listener for WebSocket errors
        autoScanSocket.addEventListener("error", (error) => {
            console.error("WebSocket error:", error);
        });

        // Event listener for receiving a message from the server
        autoScanSocket.addEventListener("message", (event) => {
            // Close the WebSocket connection after receiving the response
            autoScanSocket.close();
        });

        // Event listener for closing the WebSocket connection
        autoScanSocket.addEventListener("close", () => {
            console.log("WebSocket closed.");
        });
    }

    window.addEventListener('load', initialize);

function initialize() {
    const ScannerButton = document.createElement('button');
    ScannerButton.classList.add('hide-phone');
    ScannerButton.id = 'Scan-on-off';
    ScannerButton.setAttribute('aria-label', 'Scan');
    ScannerButton.setAttribute('data-tooltip', 'Auto Scan on/off');
    ScannerButton.setAttribute('data-scan-status', 'off');
    ScannerButton.style.borderRadius = '0px 0px 0px 0px';
    ScannerButton.style.position = 'relative';
    ScannerButton.style.top = '0px';
    ScannerButton.style.right = '0px';
    ScannerButton.innerHTML = 'Auto<br>Scan';
    ScannerButton.classList.add('bg-color-3');

    // Überprüfen, ob ein Button mit dem Label "Mute" existiert
    const muteButton = document.querySelector('button[aria-label="Mute"]');
    if (muteButton) {
        ScannerButton.style.width = 'calc(100% - 1px)';
        ScannerButton.style.marginLeft = '-1px';
    } else {
        ScannerButton.style.width = 'calc(100% - 2px)';
        ScannerButton.style.marginLeft = '0px';
    }

    if (isESP32WithPE5PVB) {
        const buttonEq = document.querySelector('.button-eq');
        const buttonIms = document.querySelector('.button-ims');

        const newDiv = document.createElement('div');
        newDiv.className = "hide-phone panel-50 no-bg h-100 m-0";
        newDiv.appendChild(ScannerButton);

        buttonEq.parentNode.insertBefore(newDiv, buttonIms);
    }

    let blinkInterval;

    function toggleScan() {
        const ScanButton = document.getElementById('Scan-on-off');
        const isScanOn = ScanButton.getAttribute('data-scan-status') === 'on';

        if (isScanOn) {
            ScanButton.setAttribute('data-scan-status', 'off');
            ScanButton.classList.remove('bg-color-4');
            ScanButton.classList.add('bg-color-3');
            clearInterval(blinkInterval);
            sendCommandToClient('J0');

            // Save dropdown values
            saveDropdownValues();

            // Remove scanner controls and restore volume slider
            const scannerControls = document.getElementById('scanner-controls');
            if (scannerControls) {
                scannerControls.parentNode.removeChild(scannerControls);
            }

            // Volume Slider wieder einblenden
            const volumeSliderParent = document.getElementById('volumeSlider').parentNode;
            volumeSliderParent.style.display = 'block';
        } else {
            ScanButton.setAttribute('data-scan-status', 'on');
            ScanButton.classList.remove('bg-color-3');
            ScanButton.classList.add('bg-color-4');
            clearInterval(blinkInterval);
            sendCommandToClient('J1');
            blinkInterval = setInterval(function () {
                ScanButton.classList.toggle('bg-color-3');
                ScanButton.classList.toggle('bg-color-4');
            }, 500);

            // Create scanner controls
            createScannerControls();
            // Restore dropdown values
            restoreDropdownValues();
        }

        // Update button text based on state
        ScanButton.innerHTML = `Auto<br>Scan`;
    }

    const ScanButton = document.getElementById('Scan-on-off');
    ScanButton.addEventListener('click', toggleScan);

    // Starten des Blinkens, wenn der Button beim Laden der Seite auf ON gesetzt ist
    if (ScanButton.getAttribute('data-scan-status') === 'on') {
        blinkInterval = setInterval(function () {
            ScanButton.classList.toggle('bg-color-3');
            ScanButton.classList.toggle('bg-color-4');
        }, 500);
    } else {
        // Bei Start des Scanners den Volume Slider einblenden
        const volumeSliderParent = document.getElementById('volumeSlider').parentNode;
        volumeSliderParent.style.display = 'block';
    }
}

let sensitivityValue = null;
let delayValue = null;

function createScannerControls() {
    // Flex-Container für Scanner Sensitivity und Scanner Delay erstellen
    const scannerControls = document.createElement('div');
    scannerControls.className = "panel-50 no-bg h-100";
    scannerControls.id = "scanner-controls";
    scannerControls.style.width = '96%';
    scannerControls.style.display = 'flex';
    scannerControls.style.justifyContent = 'space-between';
    scannerControls.style.marginTop = "0px";
    scannerControls.style.position = 'relative'; // Make sure it's on top

    const sensitivityContainer = document.createElement('div');
    sensitivityContainer.className = "dropdown";
    sensitivityContainer.style.marginRight = "5px";
    sensitivityContainer.style.marginLeft = "-5px";
    sensitivityContainer.style.width = "100%";
    sensitivityContainer.style.height = "99%";
    sensitivityContainer.style.position = 'relative'; // Make sure it's on top

    sensitivityContainer.innerHTML = `
        <input type="text" placeholder="Sensitivity" title="Scanner Sensitivity" readonly>
        <ul class="options open-top" style="position: absolute;  display: none; bottom: 100%; margin-bottom: 5px;">
            <li data-value="1" class="option">1</li>
            <li data-value="5" class="option">5</li>
            <li data-value="10" class="option">10</li>
            <li data-value="15" class="option">15</li>
            <li data-value="20" class="option">20</li>
            <li data-value="25" class="option">25</li>
            <li data-value="30" class="option">30</li>
        </ul>
    `;

    const delayContainer = document.createElement('div');
    delayContainer.className = "dropdown";
    delayContainer.style.marginLeft = "0px";
    delayContainer.style.marginRight = "-5px";
    delayContainer.style.width = "100%";
    delayContainer.style.height = "99%";
    delayContainer.style.position = 'relative'; // Make sure it's on top

    delayContainer.innerHTML = `
        <input type="text" placeholder="Scanhold" title="Scanhold Time" readonly>
        <ul class="options open-top" style="position: absolute; display: none; bottom: 100%; margin-bottom: 5px;">
            <li data-value="0.5" class="option">0.5 sec.</li>
            <li data-value="1" class="option">1 sec.</li>
            <li data-value="3" class="option">3 sec.</li>
            <li data-value="5" class="option">5 sec.</li>
            <li data-value="10" class="option">10 sec.</li>
            <li data-value="20" class="option">20 sec.</li>
            <li data-value="30" class="option">30 sec.</li>
        </ul>
    `;

    scannerControls.appendChild(sensitivityContainer);
    scannerControls.appendChild(delayContainer);

    // Volume Slider ersetzen durch Flex-Container mit Scanner Controls
    const volumeSliderParent = document.getElementById('volumeSlider').parentNode;
    volumeSliderParent.style.display = 'none'; // Volume Slider ausblenden
    volumeSliderParent.parentNode.insertBefore(scannerControls, volumeSliderParent.nextSibling);

    // Initialize dropdown functionality
    initializeDropdown(sensitivityContainer, 'Selected Sensitivity:', 'I');
    initializeDropdown(delayContainer, 'Selected Delay:', 'K');
}

function initializeDropdown(container, logPrefix, commandPrefix) {
    const input = container.querySelector('input');
    const options = container.querySelectorAll('.option');
    const dropdown = container.querySelector('.options');

    input.addEventListener('click', () => {
        const isOpen = dropdown.style.display === 'block';
        closeAllDropdowns(); // Close all other dropdowns
        dropdown.style.display = isOpen ? 'none' : 'block';
    });

    options.forEach(option => {
        option.addEventListener('click', () => {
            const value = option.getAttribute('data-value');
            input.value = option.textContent.trim();
            input.setAttribute('data-value', value); // Set data-value attribute
            dropdown.style.display = 'none'; // Dropdown nach Auswahl schließen
            sendCommandToClient(`${commandPrefix}${value}`);
        });
    });

    document.addEventListener('click', (event) => {
        if (!container.contains(event.target)) {
            dropdown.style.display = 'none';
        }
    });

    // Restore saved value if exists
    if (commandPrefix === 'I' && sensitivityValue) {
        const savedOption = [...options].find(opt => opt.getAttribute('data-value') === sensitivityValue);
        if (savedOption) {
            input.value = savedOption.textContent.trim();
            input.setAttribute('data-value', sensitivityValue); // Set data-value attribute
        }
    } else if (commandPrefix === 'K' && delayValue) {
        const savedOption = [...options].find(opt => opt.getAttribute('data-value') === delayValue);
        if (savedOption) {
            input.value = savedOption.textContent.trim();
            input.setAttribute('data-value', delayValue); // Set data-value attribute
        }
    }
}

function closeAllDropdowns() {
    const allDropdowns = document.querySelectorAll('.scanner-dropdown .options');
    allDropdowns.forEach(dropdown => {
        dropdown.style.display = 'none';
    });
}

function saveDropdownValues() {
    const sensitivityInput = document.querySelector('#scanner-controls .dropdown:nth-child(1) input');
    const delayInput = document.querySelector('#scanner-controls .dropdown:nth-child(2) input');
    sensitivityValue = sensitivityInput.getAttribute('data-value');
    delayValue = delayInput.getAttribute('data-value');
}

function restoreDropdownValues() {
    if (sensitivityValue !== null && delayValue !== null) {
        const sensitivityInput = document.querySelector('#scanner-controls .dropdown:nth-child(1) input');
        const delayInput = document.querySelector('#scanner-controls .dropdown:nth-child(2) input');
        
        // Find the correct option element by value and set the input value
        const sensitivityOption = document.querySelector(`#scanner-controls .dropdown:nth-child(1) .option[data-value="${sensitivityValue}"]`);
        const delayOption = document.querySelector(`#scanner-controls .dropdown:nth-child(2) .option[data-value="${delayValue}"]`);
        
        if (sensitivityOption) {
            sensitivityInput.value = sensitivityOption.textContent.trim();
            sensitivityInput.setAttribute('data-value', sensitivityValue);
        }
        if (delayOption) {
            delayInput.value = delayOption.textContent.trim();
            delayInput.setAttribute('data-value', delayValue);
        }
    }
}

})();
