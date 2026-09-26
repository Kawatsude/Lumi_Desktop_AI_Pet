# Lumi_Desktop_AI_Pet
A frameless, transparent 3D desktop AI assistant powered by Electron, OpenAI, and Three.js (VRM). Features real-time voice chat, procedurally animated gestures, and facial expressions.
Desktop AI Waifu (Lumi)

Features
Transparent Frameless Window: Runs directly on your desktop background. You can click and drag her around.
Voice-to-Voice: Uses OpenAI Whisper for speech recognition and OpenAI TTS for speaking.
Lip Sync & Expressions: Her mouth moves when she speaks, and she reacts with facial expressions (joy, angry, sorrow) based on her current mood.
Persistent Memory: She remembers the conversation even if you close the app.
Notepad: Tell her to remember specific facts permanently by typing /note <fact>.
How to Install (For absolute beginners)

Download the code: Clone this repository or download it as a ZIP file and extract it to a folder.

Get an OpenAI API Key:
Go to OpenAI API Keys
Create a new secret key. You will need to add at least $5 to your billing account for the API to work.
Insert your API Key:
Open main.js with any text editor (like Notepad).
Find the line at the very top: const OPENAI_API_KEY = "";
Paste your key between the quotes like this: const OPENAI_API_KEY = "sk-proj-YOUR-KEY-HERE";
Install NodeJS:
Download and install Node.js. Make sure you install it properly.
Run the App:
Just double-click the start.bat file in the folder! 
The first time it runs, it will take a few seconds to download Electron. After that, Lumi will appear on your desktop!
Controls
Drag the Window: Left-click on Lumi and drag her anywhere on your screen.
Rotate Camera: Right-click on Lumi and drag to rotate the 3D camera. Scroll to zoom in/out.
Talk via Mic: Click the Microphone button (🎙️), speak, and click it again to send. She will automatically reply!
Text Chat: Just type in the input box and press Send.
Permanent Notes: Type /note I like cats to make her remember it forever. Type /clearnotes to erase all permanent notes.

