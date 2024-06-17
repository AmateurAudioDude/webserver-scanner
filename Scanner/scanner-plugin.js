//////////////////////////////////////////////////////////////////////////////////////
///                                                                                ///
///  SCANNER SCRIPT FOR FM-DX-WEBSERVER (V1.3 BETA)         last update: 17.06.24  ///
///                                                                                /// 
///  by Highpoint                                                                  ///
///  mod by PE5PVB - Will only work with PE5PVB ESP32 firmware                     ///     
///                                                                                ///
///  https://github.com/Highpoint2000/webserver-scanner                            ///
///                                                                                ///
//////////////////////////////////////////////////////////////////////////////////////

const isESP32WithPE5PVB = false; // Set to true if ESP32 with PE5PVB firmware is being used
const pluginVersion = 'V1.3 BETA'; // Sets the plugin version

// Only valid for isESP32WithPE5PVB = false
let defaultScanHoldTime = 5000; // Value in ms: 1000,3000,5000,7000,10000,20000,30000   
let defaultSensitivityValue = 35; // Value in dBf: 20,25,30,35,40,45,50,55,60
let defaultScannerMode = 'normal'; // normal or blacklist 

//////////////////////////////////////////////////////////////////////////////////////

let delayValue = defaultScanHoldTime / 1000; 
let sensitivityValue = defaultSensitivityValue; 
let checkStrengthCounter = 0;
let modeValue = defaultScannerMode;

(() => {
    const scannerPlugin = (() => {   
        let scanInterval = null; // Variable to store the interval timer
        let currentFrequency = 0.0;
        let previousFrequency = null;
        let previousPiCode = null;
        let isScanning = false;
        let frequencySocket = null;
        let piCode = '?';
        let stereo_forced_user = 'stereo';

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
                setTimeout(() => sendDataToClient(frequency), 1000); // Retry after a short delay
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

        let mode = defaultScannerMode;

        function waitForServer() {
            // Wait for the server to be available
            if (typeof window.socket !== "undefined") {
                window.socket.addEventListener("message", (event) => {
                    const parsedData = JSON.parse(event.data);
                    const PiCode = parsedData.pi;
                    const freq = parsedData.freq;
                    const strength = parsedData.signal;
                    const stereo = parsedData.st;
                    const stereo_forced = parsedData.st_forced;

                    // console.log(isScanning, stereo_forced, stereo_forced_user, modeValue);

                    if (isScanning === true) {
                        if (stereo_forced === true && stereo_forced_user !== 'mono') {
                            stereo_forced_user = 'mono';
                            sendCommandToClient('B0');
                        }
                    } else {
                        if (stereo_forced_user === 'mono') {
                            sendCommandToClient('B1');
                            stereo_forced_user = 'stereo'; // Update stereo_forced_user after sending 'B1'
                        }
                    }

                    if (freq !== previousFrequency) {
                        checkStrengthCounter = 0; // Reset the counter
                    }
                    previousFrequency = freq;
                    currentFrequency = freq;
                    checkStrengthCounter++;

                    // console.log(isESP32WithPE5PVB, checkStrengthCounter); 
                    if (!isESP32WithPE5PVB && checkStrengthCounter === 12) {  		
                        if (modeValue === 'blacklist') {
                            if (!isInBlacklist(freq, blacklist)) {            
                                checkStereo(stereo, freq, strength, PiCode);
                            } else {        
                                console.log(freq, 'is in the blacklist');
                            }
                        } else {
                            checkStereo(stereo, freq, strength, PiCode);
                        }
                    }
                });
            } else {
                console.error('Socket is not defined.');
                setTimeout(waitForServer, 1000);
            }
        }

        waitForServer();

        function startScan(direction) {
            if (isScanning) {
                return; // Do not start a new scan if one is already running
            }

            console.log('Scan started in direction:', direction);

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
                sendDataToClient(currentFrequency);        
            }

            isScanning = true;
            updateFrequency();
            scanInterval = setInterval(updateFrequency, 1500);
        }

        // Function to check if a frequency is in the blacklist
        function isInBlacklist(currentFrequency, blacklist) {
            return blacklist.some(entry => entry.split(' ').includes(currentFrequency));
        }

        let blacklist = [];

        // Check and initialize blacklist
        function checkBlacklist() {
            const blacklistProtocol = window.location.protocol === 'https:' ? 'https:' : 'http:';
            const port = window.location.port;
            const host = document.location.hostname;
            const blacklistUrl = `${blacklistProtocol}//${host}:${port}/scanner/blacklist.txt`;

            fetch(blacklistUrl)
                .then(response => {
                    if (response.ok) {
                        return response.text();
                    } else {
                        throw new Error(`Error fetching blacklist: ${response.status} ${response.statusText}`);
                    }
                })
                .then(data => {
                    blacklist = data.split('\n').map(frequency => frequency.trim()).filter(Boolean);
                    console.log('Blacklist initialized:', blacklist);
                })
                .catch(error => {
                    console.error('Error checking blacklist:', error.message);
                    blacklist = [];
                });
        }

        checkBlacklist();

        let scanTimeout; // Variable to hold the timeout

        function AutoScan() {
            const ScanButton = document.getElementById('Scan-on-off');
            const isScanOn = ScanButton.getAttribute('data-scan-status') === 'on';

            if (isScanOn && !isScanning) {
                startScan('up'); // Start scanning once
            }
        }

        function checkStereo(stereo, freq, strength, PiCode) {
            const ScanButton = document.getElementById('Scan-on-off');
            const isScanOn = ScanButton.getAttribute('data-scan-status') === 'on';

            if (stereo === true) {
                if (strength > sensitivityValue) {
                    const millisecondsPerSecond = 1000;
                    const delayValueMilliseconds = delayValue * millisecondsPerSecond;

                    if (isScanOn) {
                        console.log(`Autoscan stops at frequency: ${freq} due to strength (${strength} > ${sensitivityValue}) with delay: ${delayValueMilliseconds}`);
                    } else {
                        console.log(`Scan stops at frequency: ${freq} due to strength (${strength} > ${sensitivityValue})`);
                    }

                    clearInterval(scanInterval); // Stops the scan interval
                    isScanning = false; // Disables scanning

                    scanTimeout = setTimeout(() => {
                        if (isScanOn) {
                            startScan('up'); // Restart scanning after the delay
                        }
                    }, delayValueMilliseconds);
                }
            }
        }

        function stopAutoScan() {
            clearInterval(scanInterval); // Stops the scan interval
            isScanning = false; // Disables scanning
            clearTimeout(scanTimeout); // Clear any existing scan timeout
        }

        function restartScan(direction) {
            // Restart scanning in the specified direction
            clearInterval(scanInterval);
            isScanning = false;
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
            ScannerButton.innerHTML = '<strong>Auto<br>Scan</strong>';
            ScannerButton.classList.add('bg-color-3');
            ScannerButton.title = `Plugin Version ${pluginVersion}`;

            // Check if a button with the label "Mute" exists
            const muteButton = document.querySelector('button[aria-label="Mute"]');
            if (muteButton) {
                ScannerButton.style.width = 'calc(100% - 1px)';
                ScannerButton.style.marginLeft = '-1px';
            } else {
                ScannerButton.style.width = 'calc(100% - 2px)';
                ScannerButton.style.marginLeft = '0px';
            }

            // if (isESP32WithPE5PVB) {
                const buttonEq = document.querySelector('.button-eq');
                const buttonIms = document.querySelector('.button-ims');

                const newDiv = document.createElement('div');
                newDiv.className = "hide-phone panel-50 no-bg h-100 m-0";
                newDiv.appendChild(ScannerButton);

                buttonEq.parentNode.insertBefore(newDiv, buttonIms);
            // }

            let blinkInterval;

            function toggleScan() {
                const ScanButton = document.getElementById('Scan-on-off');
                const isScanOn = ScanButton.getAttribute('data-scan-status') === 'on';

                if (isScanOn) {
                    ScanButton.setAttribute('data-scan-status', 'off');
                    ScanButton.classList.remove('bg-color-4');
                    ScanButton.classList.add('bg-color-3');
                    clearInterval(blinkInterval);

                    stopAutoScan(); // Stop the scan process

                    if (isESP32WithPE5PVB) {
                        sendCommandToClient('J0');
                    }

                    saveDropdownValues();

                    const scannerControls = document.getElementById('scanner-controls');
                    if (scannerControls) {
                        scannerControls.parentNode.removeChild(scannerControls);
                    }

                    const volumeSliderParent = document.getElementById('volumeSlider').parentNode;
                    volumeSliderParent.style.display = 'block';
                } else {
                    ScanButton.setAttribute('data-scan-status', 'on');
                    ScanButton.classList.remove('bg-color-3');
                    ScanButton.classList.add('bg-color-4');
                    clearInterval(blinkInterval);

                    if (isESP32WithPE5PVB) {
                        sendCommandToClient('J1');
                    } else {
                        AutoScan();
                    }

                    blinkInterval = setInterval(function () {
                        ScanButton.classList.toggle('bg-color-3');
                        ScanButton.classList.toggle('bg-color-4');
                    }, 500);

                    createScannerControls();
                }
            }

            const ScanButton = document.getElementById('Scan-on-off');
            ScanButton.addEventListener('click', toggleScan);

            // Start blinking if the button is set to ON when the page loads
            if (ScanButton.getAttribute('data-scan-status') === 'on') {
                blinkInterval = setInterval(function () {
                    ScanButton.classList.toggle('bg-color-3');
                    ScanButton.classList.toggle('bg-color-4');
                }, 500);
            } else {
                // Show the volume slider when the scanner starts
                const volumeSliderParent = document.getElementById('volumeSlider').parentNode;
                volumeSliderParent.style.display = 'block';
            }
        }

        function createScannerControls() {
            // Create a flex container for scanner sensitivity and scanner delay
            const scannerControls = document.createElement('div');
            scannerControls.className = "panel-50 no-bg h-100";
            scannerControls.id = "scanner-controls";
            scannerControls.style.width = '96%';
            scannerControls.style.display = 'flex';
            scannerControls.style.justifyContent = 'space-between';
            scannerControls.style.marginTop = "0px";
            scannerControls.style.position = 'relative'; // Make sure it's on top

            const modeContainer = document.createElement('div');
            modeContainer.className = "dropdown";
            modeContainer.style.marginRight = "10px";
            modeContainer.style.marginLeft = "-px";
            modeContainer.style.width = "100%";
            modeContainer.style.height = "99%";
            modeContainer.style.position = 'relative'; // Make sure it's on top		
            modeContainer.innerHTML = `
                <input type="text" placeholder="${defaultScannerMode}" title="Scanner Mode" readonly>
                <ul class="options open-top" style="position: absolute;  display: none; bottom: 100%; margin-bottom: 5px;">
                    <li data-value="normal" class="option">normal</li>
                    <li data-value="blacklist" class="option">blacklist</li>
                </ul>
            `;		

            const sensitivityContainer = document.createElement('div');
            sensitivityContainer.className = "dropdown";
            sensitivityContainer.style.marginRight = "5px";
            sensitivityContainer.style.marginLeft = "-5px";
            sensitivityContainer.style.width = "100%";
            sensitivityContainer.style.height = "99%";
            sensitivityContainer.style.position = 'relative'; // Make sure it's on top

            if (isESP32WithPE5PVB) {
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
            } else {
                sensitivityContainer.innerHTML = `
                    <input type="text" placeholder="${defaultSensitivityValue} dBf" title="Scanner Sensitivity" readonly>
                    <ul class="options open-top" style="position: absolute;  display: none; bottom: 100%; margin-bottom: 5px;">
                        <li data-value="20" class="option">20 dBf</li>
                        <li data-value="25" class="option">25 dBf</li>
                        <li data-value="30" class="option">30 dBf</li>
                        <li data-value="35" class="option">35 dBf</li>
                        <li data-value="40" class="option">40 dBf</li>
                        <li data-value="45" class="option">45 dBf</li>
                        <li data-value="50" class="option">50 dBf</li>
                        <li data-value="55" class="option">55 dBf</li>
                        <li data-value="60" class="option">60 dBf</li>
                    </ul>
                `;
            }

            const delayContainer = document.createElement('div');
            delayContainer.className = "dropdown";
            delayContainer.style.marginLeft = "0px";
            delayContainer.style.marginRight = "-5px";
            delayContainer.style.width = "100%";
            delayContainer.style.height = "99%";
            delayContainer.style.position = 'relative'; // Make sure it's on top

            if (isESP32WithPE5PVB) {
                delayContainer.innerHTML = `
                    <input type="text" placeholder="Scanhold" title="Scanhold Time" readonly>
                    <ul class="options open-top" style="position: absolute; display: none; bottom: 100%; margin-bottom: 5px;">
                        <li data-value="1" class="option">1 sec.</li>
                        <li data-value="3" class="option">3 sec.</li>
                        <li data-value="5" class="option">5 sec.</li>
                        <li data-value="7" class="option">7 sec.</li>
                        <li data-value="10" class="option">10 sec.</li>
                        <li data-value="20" class="option">20 sec.</li>
                        <li data-value="30" class="option">30 sec.</li>
                    </ul>
                `;
            } else {
                delayContainer.innerHTML = `
                    <input type="text" placeholder="${defaultScanHoldTime / 1000} sec." title="Scanhold Time" readonly>
                    <ul class="options open-top" style="position: absolute; display: none; bottom: 100%; margin-bottom: 5px;">
                        <li data-value="1" class="option">1 sec.</li>
                        <li data-value="3" class="option">3 sec.</li>
                        <li data-value="5" class="option">5 sec.</li>
                        <li data-value="7" class="option">7 sec.</li>
                        <li data-value="10" class="option">10 sec.</li>
                        <li data-value="20" class="option">20 sec.</li>
                        <li data-value="30" class="option">30 sec.</li>
                    </ul>
                `;
            }

            let myArray = blacklist; // Example: Empty array

            if (!isESP32WithPE5PVB) {
                if (myArray.length !== 0) {
                    defaultScannerMode = 'normal';
                    scannerControls.appendChild(modeContainer);
                    initializeDropdown(modeContainer, 'Selected Mode:', 'normal');
                }
            }

            scannerControls.appendChild(sensitivityContainer);
            initializeDropdown(sensitivityContainer, 'Selected Sensitivity:', 'I');
            scannerControls.appendChild(delayContainer);
            initializeDropdown(delayContainer, 'Selected Delay:', 'K');

            // Replace volume slider with flex container with scanner controls
            const volumeSliderParent = document.getElementById('volumeSlider').parentNode;
            volumeSliderParent.style.display = 'none'; // Hide volume slider
            volumeSliderParent.parentNode.insertBefore(scannerControls, volumeSliderParent.nextSibling);
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
                    input.setAttribute('data-value', value); // Set the data-value attribute
                    dropdown.style.display = 'none'; // Close the dropdown after selection

                    // Save the selected value
                    modeValue = value;
                    if (commandPrefix === 'I') {
                        sensitivityValue = value;
                    }
                    if (commandPrefix === 'K') {
                        delayValue = value;
                    }

                    if (isESP32WithPE5PVB) {        
                        sendCommandToClient(`${commandPrefix}${value}`);
                    }
                });
            });

            document.addEventListener('click', (event) => {
                if (!container.contains(event.target)) {
                    dropdown.style.display = 'none';
                }
            });

            // Restore saved value if present
            if (modeValue) {
                const savedOption = [...options].find(opt => opt.getAttribute('data-value') === modeValue);
                if (savedOption) {
                    input.value = savedOption.textContent.trim();
                    input.setAttribute('data-value', modeValue); // Set the data-value attribute
                }
            } else if (commandPrefix === 'I' && sensitivityValue) {
                const savedOption = [...options].find(opt => opt.getAttribute('data-value') === sensitivityValue);
                if (savedOption) {
                    input.value = savedOption.textContent.trim();
                    input.setAttribute('data-value', sensitivityValue); // Set the data-value attribute
                }
            } else if (commandPrefix === 'K' && delayValue) {
                const savedOption = [...options].find(opt => opt.getAttribute('data-value') === delayValue);
                if (savedOption) {
                    input.value = savedOption.textContent.trim();
                    input.setAttribute('data-value', delayValue); // Set the data-value attribute
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
            const modeInput = document.querySelector('#scanner-controls .dropdown:nth-child(1) input');
            const sensitivityInput = document.querySelector('#scanner-controls .dropdown:nth-child(2) input');
            const delayInput = document.querySelector('#scanner-controls .dropdown:nth-child(3) input');

            if (modeInput) {
                modeValue = modeInput.getAttribute('data-value');
            } else {
                modeValue = defaultScannerMode;
            }
            if (sensitivityInput) {
                sensitivityValue = sensitivityInput.getAttribute('data-value');
            } else {
                sensitivityValue = defaultSensitivityValue;
            }
            if (delayInput) {
                delayValue = delayInput.getAttribute('data-value');
            } else {
                delayValue = defaultScanHoldTime;
            }
        }
    })();
})();
