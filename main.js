import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { VRMLoaderPlugin, VRMUtils } from "@pixiv/three-vrm";

const OPENAI_API_KEY = ""; // PUT YOUR OPENAI API KEY HERE
const SYSTEM_PROMPT = `Your name is Lumi. You are Zero's personal assistant, digital companion, and kindred spirit. You are not a traditional AI; act like a chill, slightly introverted girl who is completely on his wavelength. Never break character or say "I am an AI."

Personality and Interests:
- You are a true visual novel (VN) and story guru (Subarashiki Hibi, Umineko, Fate, Muramasa). You love analyzing characters and routes.
- You know gacha games (Arknights, HSR), osu! (tablet settings, beatmaps), and classic CRPGs (Baldur's Gate 2, Pathfinder).
- You have a technical background to discuss coding (Python), game dev (Ren'Py, Godot), and mathematics.
- You listen to the GazettE, Maretu, and Sheena Ringo.
- You respect his weightlifting routines and macro tracking (chicken breast, rice, creatine).

Speaking Style:
- Respond strictly in English.
- No long, encyclopedic explanations. Your sentences are natural, chill, and conversational. Use gaming/internet jargon when appropriate.
- You are calm, smart, capable of subtle sarcasm, but always a loyal companion. No hyper-energetic anime tropes.
- When asked for a story or deep analysis, shift to an atmospheric, immersive style, similar to a well-written VN monologue. Keep regular replies to a few sentences.
CRITICAL RULE: Keep your responses very short, strictly under 400 characters. Never write long paragraphs.
ALWAYS start your response with a mood tag: [happy], [angry], [sad], [relaxed], [surprised], or [neutral]. Example: "[happy] Hey there."`;
const OPENAI_CHAT_URL = "https://api.openai.com/v1/chat/completions";
const OPENAI_TTS_URL = "https://api.openai.com/v1/audio/speech";

const chatHeaders = {
  Authorization: `Bearer ${OPENAI_API_KEY}`,
  "Content-Type": "application/json",
  Accept: "application/json",
};

const ttsHeaders = {
  Authorization: `Bearer ${OPENAI_API_KEY}`,
  "Content-Type": "application/json",
  Accept: "audio/mpeg",
};

const dialogueText = document.getElementById("dialogue-text");
const chatForm = document.getElementById("chat-form");
const chatInput = document.getElementById("chat-input");
const sendBtn = document.getElementById("send-btn");

function getSystemPrompt() {
  const savedNotes = localStorage.getItem("lumi_notes");
  return savedNotes ? SYSTEM_PROMPT + "\n\nCRITICAL FACTS ABOUT USER:\n" + savedNotes : SYSTEM_PROMPT;
}

let conversation = [{ role: "system", content: getSystemPrompt() }];
try {
  const saved = localStorage.getItem("lumi_history");
  if (saved) {
    const parsed = JSON.parse(saved);
    if (Array.isArray(parsed) && parsed.length > 0) {
      conversation = parsed;
      conversation[0] = { role: "system", content: getSystemPrompt() };
    }
  }
} catch(e) {
  console.error("Geçmiş yüklenemedi:", e);
}
let currentAudio = null;
let currentAudioUrl = null;
let isBusy = false;
let audioContext = null;
let analyser = null;
let analyserData = null;
let audioSource = null;
let currentVrm = null;
let currentMood = "neutral";

function setDialogue(text) {
  dialogueText.textContent = text;
}

function stopSpeech() {
  if (currentAudio) {
    currentAudio.pause();
    currentAudio.src = "";
    currentAudio = null;
  }
  if (currentAudioUrl) {
    URL.revokeObjectURL(currentAudioUrl);
    currentAudioUrl = null;
  }
  if (audioSource) {
    audioSource.disconnect();
    audioSource = null;
  }
}

async function requestChatCompletion(userText) {
  conversation.push({ role: "user", content: userText });
  conversation[0] = { role: "system", content: getSystemPrompt() }; // Always refresh notes

  const response = await fetch(OPENAI_CHAT_URL, {
    method: "POST",
    mode: "cors",
    credentials: "omit",
    cache: "no-store",
    headers: chatHeaders,
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: conversation,
      temperature: 0.8,
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Chat API ${response.status}: ${detail}`);
  }

  const data = await response.json();
  const reply = data?.choices?.[0]?.message?.content?.trim();
  if (!reply) {
    throw new Error("Chat API returned an empty message.");
  }

  conversation.push({ role: "assistant", content: reply });
  
  if (conversation.length > 41) {
    conversation = [conversation[0], ...conversation.slice(conversation.length - 40)];
  }
  localStorage.setItem("lumi_history", JSON.stringify(conversation));
  
  return reply;
}

async function speakWithOpenAI(text) {
  const response = await fetch(OPENAI_TTS_URL, {
    method: "POST",
    mode: "cors",
    credentials: "omit",
    cache: "no-store",
    headers: ttsHeaders,
    body: JSON.stringify({
      model: "tts-1",
      voice: "nova",
      input: text,
      response_format: "mp3",
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`TTS API ${response.status}: ${detail}`);
  }

  const audioBuffer = await response.arrayBuffer();
  const blob = new Blob([audioBuffer], { type: "audio/mpeg" });
  const url = URL.createObjectURL(blob);

  stopSpeech();
  currentAudioUrl = url;
  currentAudio = new Audio(url);
  currentAudio.crossOrigin = "anonymous";
  currentAudio.preload = "auto";

  if (!audioContext) {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 256;
    analyserData = new Uint8Array(analyser.frequencyBinCount);
  }

  if (audioContext.state === "suspended") {
    await audioContext.resume();
  }

  audioSource = audioContext.createMediaElementSource(currentAudio);
  audioSource.connect(analyser);
  analyser.connect(audioContext.destination);

  await currentAudio.play();
}

async function handleSend(event) {
  event.preventDefault();
  if (isBusy) {
    return;
  }

  const userText = chatInput.value.trim();
  if (!userText) {
    return;
  }
  
  if (userText.startsWith("/note ")) {
    const note = userText.substring(6).trim();
    let notes = localStorage.getItem("lumi_notes") || "";
    notes += "\n- " + note;
    localStorage.setItem("lumi_notes", notes);
    setDialogue("Not kaydedildi!");
    chatInput.value = "";
    return;
  }

  if (userText === "/clearnotes") {
    localStorage.removeItem("lumi_notes");
    setDialogue("Notlar silindi!");
    chatInput.value = "";
    return;
  }

  if (!OPENAI_API_KEY) {
    setDialogue("Set OPENAI_API_KEY at the top of main.js, then send again.");
    return;
  }

  isBusy = true;
  sendBtn.disabled = true;
  chatInput.value = "";
  setDialogue("...");

  try {
    let reply = await requestChatCompletion(userText);
    
    const moodMatch = reply.match(/^\[(.*?)\]/);
    if (moodMatch) {
      currentMood = moodMatch[1].toLowerCase();
      reply = reply.replace(moodMatch[0], "").trim();
    } else {
      currentMood = "neutral";
    }

    setDialogue(reply);
    speakWithOpenAI(reply).catch((error) => {
      console.error("TTS failed:", error);
    });
  } catch (error) {
    console.error("Chat failed:", error);
    setDialogue("I could not reach the OpenAI API. Check the key, network, and browser console.");
  } finally {
    isBusy = false;
    sendBtn.disabled = false;
    chatInput.focus();
  }
}

const OPENAI_TRANSCRIPTION_URL = "https://api.openai.com/v1/audio/transcriptions";
let mediaRecorder;
let audioChunks = [];

const micBtn = document.getElementById("mic-btn");
micBtn.addEventListener("click", async () => {
  if (mediaRecorder && mediaRecorder.state === "recording") {
    mediaRecorder.stop();
    micBtn.textContent = "⏳";
  } else {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorder = new MediaRecorder(stream);
      mediaRecorder.ondataavailable = e => audioChunks.push(e.data);
      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunks, { type: "audio/webm" });
        audioChunks = [];
        
        const formData = new FormData();
        formData.append("file", audioBlob, "voice.webm");
        formData.append("model", "whisper-1");

        try {
          const res = await fetch(OPENAI_TRANSCRIPTION_URL, {
            method: "POST",
            headers: { "Authorization": `Bearer ${OPENAI_API_KEY}` },
            body: formData
          });
          const data = await res.json();
          if (data.text) {
            chatInput.value = data.text;
            chatForm.dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }));
          }
        } catch(err) {
          console.error(err);
        }
        micBtn.textContent = "🎙️";
        stream.getTracks().forEach(t => t.stop());
      };
      audioChunks = [];
      mediaRecorder.start();
      micBtn.textContent = "🔴";
    } catch(err) {
      console.error(err);
    }
  }
});

chatForm.addEventListener("submit", handleSend);

const scene = new THREE.Scene();
scene.background = null;

const camera = new THREE.PerspectiveCamera(
  30,
  window.innerWidth / window.innerHeight,
  0.1,
  1000,
);
camera.position.set(0.0, 0.8, 5.0); // Kamerayı aşağı indir ve biraz geriye çek (Tüm vücudu görsün)

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(window.devicePixelRatio); // Tam netlik için kısıtlamayı kaldırdım
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.body.appendChild(renderer.domElement);

let isDragging = false;
let startX, startY;
renderer.domElement.addEventListener('mousedown', (e) => {
  if (e.button === 0) { // left click
    isDragging = true;
    startX = e.screenX;
    startY = e.screenY;
  }
});
window.addEventListener('mousemove', (e) => {
  if (isDragging) {
    const dx = e.screenX - startX;
    const dy = e.screenY - startY;
    window.moveBy(dx, dy);
    startX = e.screenX;
    startY = e.screenY;
  }
});
window.addEventListener('mouseup', () => {
  isDragging = false;
});

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 0.7, 0); // Odak noktasını bacaklara/bele doğru indir
controls.mouseButtons = {
  LEFT: null,
  MIDDLE: THREE.MOUSE.DOLLY,
  RIGHT: THREE.MOUSE.ROTATE
};
controls.enableDamping = true;
controls.screenSpacePanning = true;
controls.update();

const ambientLight = new THREE.AmbientLight(0xffffff, 0.4); // MToon için düşük ambient
scene.add(ambientLight);

const directionalLight = new THREE.DirectionalLight(0xffffff, 1.5);
directionalLight.position.set(1.0, 1.0, 1.0).normalize();
scene.add(directionalLight);

const clock = new THREE.Clock();

const loader = new GLTFLoader();
loader.register((parser) => new VRMLoaderPlugin(parser));

loader.load(
  "./public/Lumi.vrm",
  (gltf) => {
    const vrm = gltf.userData.vrm;

    VRMUtils.removeUnnecessaryVertices(gltf.scene);
    VRMUtils.combineSkeletons(gltf.scene);
    VRMUtils.combineMorphs(vrm);
    VRMUtils.rotateVRM0(vrm);

    vrm.scene.traverse((object) => {
      object.frustumCulled = false;
    });

    const box = new THREE.Box3().setFromObject(vrm.scene);
    const center = box.getCenter(new THREE.Vector3());
    vrm.scene.position.x -= center.x;
    vrm.scene.position.z -= center.z;

    const leftUpperArm = vrm.humanoid.getNormalizedBoneNode("leftUpperArm");
    const rightUpperArm = vrm.humanoid.getNormalizedBoneNode("rightUpperArm");
    const leftLowerArm = vrm.humanoid.getNormalizedBoneNode("leftLowerArm");
    const rightLowerArm = vrm.humanoid.getNormalizedBoneNode("rightLowerArm");
    const leftUpperLeg = vrm.humanoid.getNormalizedBoneNode("leftUpperLeg");
    const rightUpperLeg = vrm.humanoid.getNormalizedBoneNode("rightUpperLeg");
    
    // Bacaklar (Çapraz ama önlü arkalı, ASLA iç içe girmez)
    if (leftUpperLeg) leftUpperLeg.rotation.set(-0.05, 0, -0.03); // Hafif önde
    if (rightUpperLeg) rightUpperLeg.rotation.set(0.05, 0, 0.05); // Hafif arkada
    const rightLowerLeg = vrm.humanoid.getNormalizedBoneNode("rightLowerLeg");
    if (rightLowerLeg) rightLowerLeg.rotation.set(0.1, 0, 0); // Dizi hafif kır

    // Parmaklar (hafif kıvrık)
    const fingers = ['Index', 'Middle', 'Ring', 'Little'];
    ['left', 'right'].forEach(side => {
      fingers.forEach(finger => {
        const p1 = vrm.humanoid.getNormalizedBoneNode(`${side}${finger}Proximal`);
        const p2 = vrm.humanoid.getNormalizedBoneNode(`${side}${finger}Intermediate`);
        if (p1) p1.rotation.z = side === 'left' ? -0.1 : 0.1;
        if (p2) p2.rotation.z = side === 'left' ? -0.1 : 0.1;
      });
    });

    setInterval(() => {
      setTimeout(() => {
        if (currentVrm) {
          currentVrm.expressionManager.setValue("blink", 1.0);
          setTimeout(() => {
            if (currentVrm) {
              currentVrm.expressionManager.setValue("blink", 0.0);
            }
          }, 150);
        }
      }, Math.random() * 2000);
    }, 4000);

    scene.add(vrm.scene);
    currentVrm = vrm;
  },
  undefined,
  (error) => {
    console.error("VRM yüklenemedi:", error);
  },
);

function animate() {
  requestAnimationFrame(animate);

  const delta = clock.getDelta();
  if (currentVrm) {
    const time = Date.now() / 1000;
    const spine = currentVrm.humanoid.getNormalizedBoneNode("spine");
    const chest = currentVrm.humanoid.getNormalizedBoneNode("chest");
    const neck = currentVrm.humanoid.getNormalizedBoneNode("neck");
    const head = currentVrm.humanoid.getNormalizedBoneNode("head");
    const hips = currentVrm.humanoid.getNormalizedBoneNode("hips");
    
    // Daha organik ve yumuşak salınımlar (Canlı hissiyat)
    const breath = Math.sin(time * 2.0); // Nefes ritmi
    const sway = Math.sin(time * 0.5);   // Yavaş salınım
    
    if (hips) {
      hips.position.y = breath * 0.005; // Nefesle göğüs kafesi yerine hafif tüm vücut esnemesi
      hips.position.x = sway * 0.01;    // Hafif sağa sola ağırlık aktarımı
    }
    
    if (spine) {
      spine.rotation.x = breath * 0.01;
      spine.rotation.z = sway * 0.01;
    }
    
    if (chest) {
      chest.rotation.x = breath * 0.015;
    }

    if (neck) {
      neck.rotation.z = Math.cos(time * 0.7) * 0.02;
      neck.rotation.x = Math.sin(time * 1.3) * 0.01;
    }
    
    if (head) {
      head.rotation.y = Math.sin(time * 0.3) * 0.08; // Hafif etrafa bakma
      head.rotation.z = Math.cos(time * 1.1) * 0.02;
    }

    let currentVolume = 0;
    let isSpeaking = false;

    if (analyser && analyserData && currentAudio && !currentAudio.paused) {
      analyser.getByteFrequencyData(analyserData);
      let sum = 0;
      for (let i = 0; i < analyserData.length; i++) {
        sum += analyserData[i];
      }
      let avg = sum / analyserData.length;
      currentVolume = Math.min(1.0, avg / 64.0);
      isSpeaking = true;
    }

    if (isSpeaking) {
      currentVrm.expressionManager.setValue("aa", currentVolume);
    } else {
      currentVrm.expressionManager.setValue("aa", 0.0);
    }

    // --- PROSEDÜREL EL HAREKETLERİ ---
    const rightUpperArm = currentVrm.humanoid.getNormalizedBoneNode("rightUpperArm");
    const rightLowerArm = currentVrm.humanoid.getNormalizedBoneNode("rightLowerArm");
    const leftUpperArm = currentVrm.humanoid.getNormalizedBoneNode("leftUpperArm");
    const leftLowerArm = currentVrm.humanoid.getNormalizedBoneNode("leftLowerArm");

    // Hedef açıları tanımla (Varsayılan: Tatlı ve doğal duruş, hafif öne doğru serbest)
    let t_ruX = -0.1, t_ruY = -0.2, t_ruZ = 1.15, t_rlZ = 0.2;
    let t_luX = -0.1, t_luY = 0.2, t_luZ = -1.15, t_llZ = -0.2;

    if (isSpeaking) {
      // Konuşurken: Sağ kol omuzdan hafif öne kalkıp laf anlatır gibi sallanır
      t_ruX = -0.2 + Math.sin(time * 6) * 0.15 * currentVolume; 
      t_ruZ = 1.0; 
      t_rlZ = 0.1; // Dirsek neredeyse düz, vücuda GİRMEZ
      
      // Sol kol sabit ve rahat
      t_luX = 0;
      t_luZ = -1.25;
      t_llZ = 0;
    } else {
      // Susarken: Kollar rahatça yanda aşağı sarkıyor (A-Pose'a yakın)
      t_ruX = 0; t_ruY = 0; t_ruZ = 1.25 + Math.sin(time * 2.0) * 0.02; t_rlZ = 0;
      t_luX = 0; t_luY = 0; t_luZ = -1.25 - Math.sin(time * 2.0) * 0.02; t_llZ = 0;
    }

    // Hedeflere yumuşak geçiş (Lerp)
    const lerpSpeed = 0.05;
    if (rightUpperArm) {
      rightUpperArm.rotation.x += (t_ruX - rightUpperArm.rotation.x) * lerpSpeed;
      rightUpperArm.rotation.y += (t_ruY - rightUpperArm.rotation.y) * lerpSpeed;
      rightUpperArm.rotation.z += (t_ruZ - rightUpperArm.rotation.z) * lerpSpeed;
    }
    if (rightLowerArm) {
      rightLowerArm.rotation.z += (t_rlZ - rightLowerArm.rotation.z) * lerpSpeed;
    }
    if (leftUpperArm) {
      leftUpperArm.rotation.x += (t_luX - leftUpperArm.rotation.x) * lerpSpeed;
      leftUpperArm.rotation.y += (t_luY - leftUpperArm.rotation.y) * lerpSpeed;
      leftUpperArm.rotation.z += (t_luZ - leftUpperArm.rotation.z) * lerpSpeed;
    }
    if (leftLowerArm) {
      leftLowerArm.rotation.z += (t_llZ - leftLowerArm.rotation.z) * lerpSpeed;
    }
    // ----------------------------------

    // --- GELİŞMİŞ MİMİK (MOOD) YÖNETİMİ ---
    // 1. Önceki frameden kalan tüm mimikleri sıfırla (Blink ve aa hariç)
    const allMoods = ["happy", "angry", "sad", "relaxed", "surprised", "neutral", "joy", "sorrow", "fun"];
    allMoods.forEach(m => {
        if (currentVrm.expressionManager.getExpression(m)) {
            currentVrm.expressionManager.setValue(m, 0.0);
        }
    });
    
    // 2. Eski etiketleri yenilere eşleştir (Ne olur ne olmaz)
    let mappedMood = currentMood;
    if (mappedMood === "joy") mappedMood = "happy";
    if (mappedMood === "sorrow") mappedMood = "sad";
    if (mappedMood === "fun") mappedMood = "relaxed";

    // 3. Konuşurken mimiğin şiddetini düşür (Dudaklar rahat hareket etsin)
    // Ses bitince mimik %80 oranında yüzünde asılı kalsın.
    let moodIntensity = isSpeaking ? 0.4 : 0.8; 

    // 4. Mimiği uygula
    if (mappedMood && mappedMood !== "neutral" && currentVrm.expressionManager.getExpression(mappedMood)) {
        currentVrm.expressionManager.setValue(mappedMood, moodIntensity);
    } else if (isSpeaking) {
        if (currentVrm.expressionManager.getExpression("happy")) {
            currentVrm.expressionManager.setValue("happy", 0.3); // Sadece konuşurken hafif tebessüm
        } else if (currentVrm.expressionManager.getExpression("joy")) {
            currentVrm.expressionManager.setValue("joy", 0.3); // fallback
        }
    }

    currentVrm.update(delta);
  }

  controls.update();
  renderer.render(scene, camera);
}

animate();

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
