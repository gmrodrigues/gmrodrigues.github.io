import * as THREE from "three";
import RAPIER from "./vendor/rapier.mjs";

await RAPIER.init();

const canvas = document.querySelector("#scene");
const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

if (canvas) {
  const scene = new THREE.Scene();
  let width = window.innerWidth;
  let height = window.innerHeight;
  const camera = new THREE.OrthographicCamera(0, width, height, 0, -300, 300);
  camera.position.z = 10;
  camera.rotation.x = -0.045;

  const renderer = new THREE.WebGLRenderer({
    canvas,
    alpha: true,
    antialias: true,
    powerPreference: "high-performance",
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  renderer.setSize(width, height);

  const skyMaterial = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uResolution: { value: new THREE.Vector2(width, height) },
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      varying vec2 vUv;
      uniform float uTime;
      uniform vec2 uResolution;

      float hash21(vec2 p) {
        p = fract(p * vec2(123.34, 456.21));
        p += dot(p, p + 45.32);
        return fract(p.x * p.y);
      }

      float noise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(
          mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x),
          mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), f.x),
          f.y
        );
      }

      float fbm(vec2 p) {
        float value = 0.0;
        float amplitude = 0.5;
        for (int i = 0; i < 4; i++) {
          value += amplitude * noise(p);
          p = p * 2.03 + 11.7;
          amplitude *= 0.5;
        }
        return value;
      }

      float stars(vec2 uv) {
        vec2 grid = uv * vec2(190.0, 100.0);
        vec2 cell = floor(grid);
        vec2 local = fract(grid) - 0.5;
        float seed = hash21(cell);
        vec2 offset = vec2(hash21(cell + 2.7), hash21(cell + 8.1)) - 0.5;
        float distanceToStar = length(local - offset * 0.72);
        float point = 1.0 - smoothstep(0.0, 0.035, distanceToStar);
        float density = smoothstep(0.79, 0.97, seed);
        float twinkle = 0.72 + 0.28 * sin(uTime * 0.7 + seed * 30.0);

        vec2 largeGrid = uv * vec2(42.0, 25.0);
        vec2 largeCell = floor(largeGrid);
        vec2 largeLocal = fract(largeGrid) - 0.5;
        float largeSeed = hash21(largeCell + 19.0);
        vec2 largeOffset = vec2(hash21(largeCell + 24.0), hash21(largeCell + 31.0)) - 0.5;
        float largePoint = 1.0 - smoothstep(0.0, 0.07, length(largeLocal - largeOffset * 0.66));
        largePoint *= smoothstep(0.91, 0.99, largeSeed);

        return point * density * twinkle + largePoint * 1.65;
      }

      void main() {
        vec2 uv = vUv;
        uv += vec2(sin(uTime * 0.28) * 0.004, cos(uTime * 0.18) * 0.003);
        float aspect = uResolution.x / uResolution.y;
        vec2 cloudUv = vec2(uv.x * aspect * 1.8, uv.y * 1.6);
        float cloud = fbm(cloudUv + vec2(uTime * 0.035, uTime * 0.009));
        float cloudDetail = fbm(vec2(uv.x * aspect * 3.4, uv.y * 3.0) + vec2(4.7 + uTime * 0.018, uTime * 0.012));
        float cloudDensity = smoothstep(0.43, 0.72, cloud * 0.68 + cloudDetail * 0.32);
        cloudDensity *= smoothstep(0.34, 0.50, uv.y);
        cloudDensity *= 1.0 - smoothstep(0.50, 1.02, uv.y);

        vec3 blue = vec3(0.008, 0.045, 0.060);
        vec3 gold = vec3(0.94, 0.63, 0.31);
        vec3 red = vec3(0.62, 0.075, 0.035);
        vec3 sky = mix(blue, gold, smoothstep(0.18, 0.57, uv.x));
        sky = mix(sky, red, smoothstep(0.56, 0.94, uv.x));

        float centralGlow = exp(-distance(uv, vec2(0.52, 0.76)) * 4.8);
        float leftGlow = exp(-distance(uv, vec2(0.28, 0.63)) * 3.2);
        sky += centralGlow * vec3(0.45, 0.35, 0.20);
        sky += leftGlow * vec3(0.07, 0.15, 0.14);

        float cloudLight = exp(-distance(uv, vec2(0.52, 0.75)) * 6.5);
        float cloudEdge = smoothstep(0.18, 0.52, cloudDensity) * (1.0 - smoothstep(0.52, 0.86, cloudDensity));
        vec2 rayUv = vec2(uv.x + (uv.y - 0.75) * 0.22, uv.y);
        float rayNoise = fbm(rayUv * vec2(aspect * 3.0, 2.0) + vec2(8.0, uTime * 0.014));
        float rayCone = 1.0 - smoothstep(0.0, 0.34, abs(rayUv.x - 0.52) * (1.1 + (0.75 - uv.y)));
        float lightShafts = rayCone * smoothstep(0.40, 0.76, rayNoise) * smoothstep(0.42, 0.72, uv.y);

        sky += (cloud - 0.48) * vec3(0.16, 0.13, 0.09);
        sky += cloudDensity * vec3(0.16, 0.14, 0.12);
        sky += cloudDensity * cloudLight * vec3(0.56, 0.39, 0.18);
        sky += cloudEdge * cloudLight * vec3(0.78, 0.58, 0.30);
        sky += lightShafts * (1.0 - cloudDensity * 0.72) * vec3(0.42, 0.28, 0.12);

        float skyMask = smoothstep(0.36, 0.49, uv.y);
        sky += stars(uv) * skyMask * vec3(0.82, 0.91, 0.87);

        float groundMask = 1.0 - smoothstep(0.39, 0.47, uv.y);
        float groundNoise = fbm(vec2(uv.x * 10.0, uv.y * 3.0));
        vec3 ground = mix(vec3(0.008, 0.014, 0.012), vec3(0.035, 0.095, 0.067), groundNoise * 0.7);
        ground *= smoothstep(0.0, 0.17, uv.y);
        vec3 color = mix(sky, ground, groundMask);

        float horizonGlow = (1.0 - smoothstep(0.38, 0.47, uv.y)) * smoothstep(0.29, 0.47, uv.y);
        color += horizonGlow * vec3(0.08, 0.07, 0.035);
        color *= 1.0 - smoothstep(0.89, 1.0, uv.x) * 0.8;
        color *= smoothstep(0.0, 0.12, uv.y);

        gl_FragColor = vec4(color, 1.0);
      }
    `,
    depthWrite: false,
    depthTest: false,
  });

  const skyPlane = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), skyMaterial);
  skyPlane.position.set(width / 2, height / 2, -20);
  skyPlane.scale.set(width * 1.12, height * 1.12, 1);
  scene.add(skyPlane);

  const treeMaterials = [
    new THREE.MeshStandardMaterial({ color: 0x08100b, roughness: 0.96, metalness: 0, side: THREE.DoubleSide }),
    new THREE.MeshStandardMaterial({ color: 0x102016, roughness: 0.98, metalness: 0, side: THREE.DoubleSide }),
    new THREE.MeshStandardMaterial({ color: 0x172d1c, roughness: 1, metalness: 0, side: THREE.DoubleSide }),
  ];
  const leafGeometry = new THREE.SphereGeometry(1, 10, 6);
  const leafMaterial = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uCanopyCenter: { value: new THREE.Vector3(width * 0.485, height * 0.405 + 300, 0) },
      uCanopySize: { value: new THREE.Vector3(210, 180, 72) },
      uTrunkCenter: { value: new THREE.Vector3(width * 0.485, height * 0.405, 0) },
      uTrunkRadius: { value: 34 },
    },
    vertexShader: `
      varying vec3 vWorldPosition;
      varying vec3 vWorldNormal;
      varying vec3 vLocalPosition;

      void main() {
        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        vWorldPosition = worldPosition.xyz;
        vWorldNormal = normalize(mat3(modelMatrix) * normal);
        vLocalPosition = position;
        gl_Position = projectionMatrix * viewMatrix * worldPosition;
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform vec3 uCanopyCenter;
      uniform vec3 uCanopySize;
      uniform vec3 uTrunkCenter;
      uniform float uTrunkRadius;
      varying vec3 vWorldPosition;
      varying vec3 vWorldNormal;
      varying vec3 vLocalPosition;

      float hash12(vec2 p) {
        p = fract(p * vec2(123.34, 456.21));
        p += dot(p, p + 45.32);
        return fract(p.x * p.y);
      }

      float noise2(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(
          mix(hash12(i), hash12(i + vec2(1.0, 0.0)), f.x),
          mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), f.x),
          f.y
        );
      }

      float triplanarNoise(vec3 p, vec3 normal) {
        vec3 blend = abs(normal);
        blend /= max(blend.x + blend.y + blend.z, 0.0001);
        float yz = noise2(p.yz);
        float xz = noise2(p.xz);
        float xy = noise2(p.xy);
        return yz * blend.x + xz * blend.y + xy * blend.z;
      }

      void main() {
        vec3 normal = normalize(vWorldNormal);
        vec3 triplanarPosition = vWorldPosition * 0.055 + vec3(uTime * 0.006, 0.0, 0.0);
        float textureNoise = triplanarNoise(triplanarPosition, normal);
        float fineNoise = triplanarNoise(triplanarPosition * 3.2, normal);

        // Recortes irregulares e transparência deixam a luz atravessar a copa.
        float holes = smoothstep(0.30, 0.42, textureNoise) * smoothstep(0.44, 0.60, fineNoise);
        if (holes < 0.16) discard;

        vec3 deepGreen = vec3(0.025, 0.105, 0.045);
        vec3 leafGreen = vec3(0.16, 0.34, 0.12);
        vec3 leafColor = mix(deepGreen, leafGreen, textureNoise * 0.8 + fineNoise * 0.2);

        float centralVein = 1.0 - smoothstep(0.0, 0.055, abs(vLocalPosition.x));
        float edge = smoothstep(0.15, 0.95, abs(vLocalPosition.y));
        leafColor += centralVein * vec3(0.17, 0.22, 0.07);
        leafColor *= 0.78 + edge * 0.22;

        vec3 warmDirection = normalize(vec3(-0.35, 0.62, 1.0));
        float warmLight = 0.45 + max(dot(normal, warmDirection), 0.0) * 0.75;
        float backLight = pow(max(dot(-normal, warmDirection), 0.0), 1.5);

        // O centro da copa recebe menos luz: as camadas externas bloqueiam a iluminação.
        vec3 canopyOffset = (vWorldPosition - uCanopyCenter) / uCanopySize;
        float radialVolume = length(canopyOffset.xy);
        float centerOcclusion = 1.0 - smoothstep(0.18, 0.92, radialVolume);
        float depthLayer = 1.0 - smoothstep(0.05, 0.92, abs(canopyOffset.z));
        float canopyShadow = centerOcclusion * (0.68 + depthLayer * 0.32);
        leafColor *= 1.0 - canopyShadow * 0.62;

        // O tronco bloqueia a luz nas folhas mais internas, criando um degradê de sombra.
        float trunkDistance = abs(vWorldPosition.x - uTrunkCenter.x);
        float trunkProximity = 1.0 - smoothstep(uTrunkRadius * 0.75, uTrunkRadius * 4.8, trunkDistance);
        float leafShadeGradient = smoothstep(0.04, 0.95, abs(vLocalPosition.x));
        float trunkShadow = trunkProximity * (0.42 + leafShadeGradient * 0.32);
        leafColor = mix(leafColor, vec3(0.008, 0.030, 0.014), trunkShadow * 0.62);
        leafColor *= 1.0 - trunkShadow * 0.26;
        leafColor *= warmLight;
        leafColor += backLight * vec3(0.24, 0.16, 0.045) * (1.0 - canopyShadow * 0.76);
        leafColor += (1.0 - centerOcclusion) * backLight * vec3(0.08, 0.12, 0.045);

        float alpha = 0.58 + textureNoise * 0.25;
        gl_FragColor = vec4(leafColor, alpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  let grassShader = null;
  const grassMaterial = new THREE.MeshStandardMaterial({
    color: 0x123b25,
    roughness: 0.95,
    metalness: 0,
    side: THREE.DoubleSide,
    vertexColors: true,
  });
  grassMaterial.onBeforeCompile = (shader) => {
    grassShader = shader;
    shader.uniforms.uTime = { value: 0 };
    shader.uniforms.uGust = { value: 0 };
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `#include <common>
        attribute float aPhase;
        uniform float uTime;
        uniform float uGust;`
      )
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
        float bladeTip = smoothstep(-0.5, 0.5, position.y);
        float bend = bladeTip * bladeTip;
        float gust = sin(uTime * 0.85 + aPhase) * 0.78
          + sin(uTime * 0.38 + aPhase * 1.73) * 0.34
          + sin(uTime * 2.1 + aPhase * 0.47) * 0.08;
        float crosswind = cos(uTime * 0.72 + aPhase * 1.31) * 0.36;
        // A base permanece firme; a ponta deita com a rajada e depois se levanta.
        float gustScale = 1.0 + uGust * 3.6;
        transformed.x += gust * bend * 8.0 * gustScale;
        transformed.z += crosswind * bend * 3.0 * gustScale;
        transformed.y -= abs(gust) * bend * 0.085 * gustScale;`
      );
  };
  const landscape = new THREE.Group();
  scene.add(landscape);
  const tree = new THREE.Group();
  scene.add(tree);
  const generatedFoliageGroup = new THREE.Group();
  generatedFoliageGroup.renderOrder = 4;
  const generatedFoliageTextures = [];
  const generatedFoliageSprites = [];
  let grassMesh = null;
  const windBranches = [];
  const windLeaves = [];
  const flyingLeaves = [];
  let leafPhysicsWorld = null;
  let windParticles = null;
  let windParticleVelocities = null;
  let lastLeafBurst = -10;
  let staticInterference = 0;
  let postStaticSway = 0;
  let leafGroundY = 0;
  const leafBillboardQuaternion = new THREE.Quaternion();
  const leafRollQuaternion = new THREE.Quaternion();
  const leafPhysicsQuaternion = new THREE.Quaternion();
  const leafPhysicsEuler = new THREE.Euler();
  const leafRollAxis = new THREE.Vector3(0, 0, 1);
  const treeWindTarget = new THREE.Vector3();

  const ambientLight = new THREE.HemisphereLight(0x9bbdc0, 0x020604, 1.45);
  const warmLight = new THREE.PointLight(0xffb35e, 4.5, Math.max(width, height) * 1.7, 1.7);
  const rimLight = new THREE.DirectionalLight(0x93c7d0, 1.15);
  warmLight.position.set(width * 0.58, height * 0.67, 230);
  rimLight.position.set(width * 0.12, height * 0.85, 150);
  scene.add(ambientLight, warmLight, rimLight);

  function makeFlareTexture(type) {
    const canvasTexture = document.createElement("canvas");
    canvasTexture.width = 128;
    canvasTexture.height = 128;
    const context = canvasTexture.getContext("2d");
    const center = 64;
    if (type === "bird") {
      context.strokeStyle = "rgba(9, 23, 25, 0.88)";
      context.lineWidth = 7;
      context.lineCap = "round";
      context.beginPath();
      context.moveTo(12, 67);
      context.quadraticCurveTo(31, 45, 62, 62);
      context.quadraticCurveTo(94, 44, 116, 67);
      context.stroke();
    } else if (type === "bat") {
      context.fillStyle = "rgba(7, 13, 22, 0.90)";
      context.beginPath();
      context.ellipse(64, 66, 7, 15, 0, 0, Math.PI * 2);
      context.moveTo(59, 57);
      context.quadraticCurveTo(40, 28, 11, 23);
      context.quadraticCurveTo(18, 48, 37, 66);
      context.quadraticCurveTo(48, 55, 59, 68);
      context.moveTo(69, 57);
      context.quadraticCurveTo(88, 28, 117, 23);
      context.quadraticCurveTo(110, 48, 91, 66);
      context.quadraticCurveTo(80, 55, 69, 68);
      context.fill();
    } else if (type === "insect") {
      const insectGradient = context.createRadialGradient(center, center, 0, center, center, 64);
      insectGradient.addColorStop(0, "rgba(255, 240, 180, 0.98)");
      insectGradient.addColorStop(0.16, "rgba(255, 190, 90, 0.78)");
      insectGradient.addColorStop(0.42, "rgba(112, 164, 125, 0.26)");
      insectGradient.addColorStop(1, "rgba(52, 83, 78, 0)");
      context.fillStyle = insectGradient;
    } else if (type === "firefly") {
      const fireflyGradient = context.createRadialGradient(center, center, 0, center, center, 64);
      fireflyGradient.addColorStop(0, "rgba(255, 255, 190, 1)");
      fireflyGradient.addColorStop(0.12, "rgba(214, 255, 107, 0.95)");
      fireflyGradient.addColorStop(0.34, "rgba(146, 229, 64, 0.32)");
      fireflyGradient.addColorStop(1, "rgba(82, 160, 42, 0)");
      context.fillStyle = fireflyGradient;
    } else if (type === "ring") {
      const ringGradient = context.createRadialGradient(center, center, 30, center, center, 62);
      ringGradient.addColorStop(0, "rgba(255, 190, 95, 0)");
      ringGradient.addColorStop(0.54, "rgba(255, 190, 95, 0)");
      ringGradient.addColorStop(0.68, "rgba(255, 205, 125, 0.72)");
      ringGradient.addColorStop(0.76, "rgba(255, 155, 65, 0.16)");
      ringGradient.addColorStop(1, "rgba(255, 125, 30, 0)");
      context.fillStyle = ringGradient;
    } else {
      const glowGradient = context.createRadialGradient(center, center, 0, center, center, 64);
      glowGradient.addColorStop(0, "rgba(255, 248, 205, 0.96)");
      glowGradient.addColorStop(0.12, "rgba(255, 205, 112, 0.72)");
      glowGradient.addColorStop(0.42, "rgba(255, 144, 48, 0.22)");
      glowGradient.addColorStop(1, "rgba(255, 94, 20, 0)");
      context.fillStyle = glowGradient;
    }
    context.fillRect(0, 0, 128, 128);
    const texture = new THREE.CanvasTexture(canvasTexture);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }

  const lensFlare = new THREE.Group();
  const lensFlareSprites = [];
  const glowTexture = makeFlareTexture("glow");
  const ringTexture = makeFlareTexture("ring");
  const flareSpecs = [
    { factor: 0.00, size: 250, color: 0xffc66f, opacity: 0.58, texture: glowTexture },
    { factor: 0.22, size: 104, color: 0xffa04f, opacity: 0.36, texture: ringTexture },
    { factor: 0.48, size: 62, color: 0xffd58d, opacity: 0.32, texture: glowTexture },
    { factor: 0.76, size: 128, color: 0xff8e43, opacity: 0.24, texture: ringTexture },
    { factor: 1.05, size: 72, color: 0xffdca0, opacity: 0.28, texture: glowTexture },
  ];
  flareSpecs.forEach(({ factor, size, color, opacity, texture }) => {
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: texture,
      color,
      transparent: true,
      opacity,
      blending: THREE.AdditiveBlending,
      depthTest: false,
      depthWrite: false,
    }));
    sprite.scale.set(size, size, 1);
    sprite.userData = { factor, size, opacity };
    lensFlare.add(sprite);
    lensFlareSprites.push(sprite);
  });
  lensFlare.renderOrder = 8;
  scene.add(lensFlare);

  function positionLensFlare() {
    const source = new THREE.Vector3(width * 0.58, height * 0.67, 5);
    const center = new THREE.Vector3(width * 0.51, height * 0.47, 5);
    const flareVector = center.sub(source);
    lensFlareSprites.forEach((sprite) => {
      const { factor } = sprite.userData;
      sprite.position.copy(source).addScaledVector(flareVector, factor);
    });
  }
  positionLensFlare();

  const fireflyGroup = new THREE.Group();
  const fireflyTexture = makeFlareTexture("firefly");
  const fireflies = [];
  fireflyGroup.renderOrder = 7;
  scene.add(fireflyGroup);

  function createFireflies() {
    fireflies.forEach(({ node }) => {
      fireflyGroup.remove(node);
      node.material.dispose();
    });
    fireflies.length = 0;
    const horizon = height * 0.405;
    const count = Math.min(30, Math.max(18, Math.floor(width / 48)));
    for (let index = 0; index < count; index += 1) {
      const phase = index * 1.73;
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
        map: fireflyTexture,
        color: 0xd9ff88,
        transparent: true,
        opacity: 0.72,
        blending: THREE.AdditiveBlending,
        depthTest: false,
        depthWrite: false,
      }));
      const baseX = width * (0.10 + (((index * 67) % 83) / 100) * 0.80);
      const baseY = horizon + 26 + ((index * 47) % Math.max(80, Math.floor(height * 0.23)));
      sprite.position.set(baseX, baseY, 2 + (index % 4) * 0.8);
      sprite.scale.set(24 + (index % 4) * 4, 24 + (index % 4) * 4, 1);
      fireflyGroup.add(sprite);
      fireflies.push({
        node: sprite,
        baseX,
        baseY,
        phase,
        driftX: 12 + (index % 5) * 4,
        driftY: 8 + (index % 4) * 3,
        speed: 1.05 + (index % 4) * 0.22,
        size: 24 + (index % 4) * 4,
      });
    }
  }
  createFireflies();

  const birdsGroup = new THREE.Group();
  const batsGroup = new THREE.Group();
  const insectsGroup = new THREE.Group();
  const birds = [];
  const bats = [];
  const insects = [];
  const birdTexture = makeFlareTexture("bird");
  const batTexture = makeFlareTexture("bat");
  const insectTexture = makeFlareTexture("insect");
  birdsGroup.renderOrder = 2;
  batsGroup.renderOrder = 2;
  insectsGroup.renderOrder = 7;
  scene.add(birdsGroup, batsGroup, insectsGroup);

  function clearSprites(group, sprites) {
    sprites.forEach(({ node }) => {
      group.remove(node);
      node.material.dispose();
    });
    sprites.length = 0;
  }

  function createSkyCreatures() {
    clearSprites(birdsGroup, birds);
    clearSprites(batsGroup, bats);
    clearSprites(insectsGroup, insects);
    const horizon = height * 0.405;

    for (let index = 0; index < 6; index += 1) {
      const phase = index * 2.1;
      const size = 26 + (index % 3) * 7;
      const node = new THREE.Sprite(new THREE.SpriteMaterial({
        map: birdTexture,
        color: 0x09191b,
        transparent: true,
        opacity: 0.76,
        depthTest: false,
        depthWrite: false,
      }));
      node.position.set(-150 - index * 210, height * (0.60 + (index % 3) * 0.07), -5.5);
      node.scale.set(size * 1.55, size, 1);
      birdsGroup.add(node);
      birds.push({ node, phase, speed: 28 + (index % 4) * 8, size, arc: 10 + (index % 3) * 5 });
    }

    for (let index = 0; index < 4; index += 1) {
      const phase = index * 2.8 + 0.7;
      const size = 42 + (index % 2) * 12;
      const node = new THREE.Sprite(new THREE.SpriteMaterial({
        map: batTexture,
        color: 0x11182a,
        transparent: true,
        opacity: 0.80,
        depthTest: false,
        depthWrite: false,
      }));
      node.position.set(width + 120 + index * 260, height * (0.66 + (index % 2) * 0.10), -4.5);
      node.scale.set(size * 1.45, size, 1);
      batsGroup.add(node);
      bats.push({ node, phase, speed: 42 + (index % 3) * 10, size, arc: 16 + (index % 2) * 8 });
    }

    const count = Math.min(34, Math.max(20, Math.floor(width / 42)));
    for (let index = 0; index < count; index += 1) {
      const phase = index * 1.37;
      const size = 7 + (index % 3) * 2;
      const node = new THREE.Sprite(new THREE.SpriteMaterial({
        map: insectTexture,
        color: index % 3 === 0 ? 0xffd18b : 0xa7d79f,
        transparent: true,
        opacity: 0.58,
        blending: THREE.AdditiveBlending,
        depthTest: false,
        depthWrite: false,
      }));
      const baseX = width * (0.06 + (((index * 83) % 91) / 100) * 0.88);
      const baseY = horizon + 16 + ((index * 61) % Math.max(90, Math.floor(height * 0.22)));
      node.position.set(baseX, baseY, 1.8 + (index % 4) * 0.35);
      node.scale.set(size, size, 1);
      insectsGroup.add(node);
      insects.push({ node, baseX, baseY, phase, size, drift: 8 + (index % 5) * 3, speed: 0.8 + (index % 4) * 0.16 });
    }
  }
  function hillHeight(x, horizon) {
    const normalized = x / Math.max(width, 1);
    return horizon + 7 + Math.sin(normalized * 8.2) * 6 + Math.sin(normalized * 22.0 + 1.4) * 2;
  }

  function getTreeWindTarget(target, localX = 0, localY = 300) {
    // O alvo acompanha posição, escala e inclinação da árvore.
    target.set(localX, localY, 0);
    tree.localToWorld(target);
    return target;
  }

  function loadGeneratedFoliage() {
    const loader = new THREE.TextureLoader();
    loader.load("./assets/generated/foliage-sprite-sheet.png", (atlas) => {
      atlas.colorSpace = THREE.SRGBColorSpace;
      const cropRects = [
        [8, 12, 340, 420], [355, 20, 304, 435], [664, 32, 302, 405], [982, 12, 264, 430],
        [2, 430, 255, 408], [260, 438, 275, 395], [520, 458, 255, 370], [772, 428, 238, 425],
        [1000, 460, 250, 390], [4, 785, 338, 460], [337, 778, 270, 468], [595, 790, 260, 452],
        [820, 792, 270, 452], [1080, 790, 170, 460],
      ];
      cropRects.forEach(([x, y, cropWidth, cropHeight]) => {
        const texture = atlas.clone();
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.wrapS = THREE.ClampToEdgeWrapping;
        texture.wrapT = THREE.ClampToEdgeWrapping;
        texture.repeat.set(cropWidth / atlas.image.width, cropHeight / atlas.image.height);
        texture.offset.set(x / atlas.image.width, 1 - (y + cropHeight) / atlas.image.height);
        texture.needsUpdate = true;
        generatedFoliageTextures.push(texture);
      });

      const placements = [
        [0, -142, 278, 82, -0.36], [1, -78, 342, 76, -0.18], [2, 16, 350, 88, 0.14],
        [3, 93, 317, 80, 0.30], [4, 145, 257, 84, 0.42], [5, -125, 218, 86, -0.48],
        [6, -46, 293, 78, -0.12], [7, 28, 300, 84, 0.16], [8, 86, 254, 76, 0.38],
        [9, 130, 214, 72, 0.52], [10, -86, 382, 62, -0.22], [11, -24, 408, 68, -0.04],
        [12, 38, 389, 64, 0.18], [13, 86, 352, 72, 0.34],
      ];
      placements.forEach(([textureIndex, x, y, size, rotation], index) => {
        const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
          map: generatedFoliageTextures[textureIndex],
          color: 0xffffff,
          transparent: true,
          opacity: 0.78,
          depthTest: false,
          depthWrite: false,
        }));
        sprite.position.set(x, y, -18 + (index % 5) * 8);
        sprite.scale.set(size * 0.62, size * 0.62, 1);
        sprite.material.rotation = rotation;
        generatedFoliageGroup.add(sprite);
        generatedFoliageSprites.push(sprite);
      });

      flyingLeaves.forEach((leaf, index) => {
        leaf.node.material.map = generatedFoliageTextures[(index * 3) % generatedFoliageTextures.length];
        leaf.node.material.color.set(0xffffff);
        leaf.node.material.needsUpdate = true;
      });
    });
  }
  loadGeneratedFoliage();

  function createLandscape() {
    if (grassMesh) {
      scene.remove(grassMesh);
      grassMesh.geometry.dispose();
      grassMesh = null;
    }
    landscape.clear();

    const horizon = height * 0.405;
    const hillShape = new THREE.Shape();
    hillShape.moveTo(-width * 0.12, 0);
    hillShape.lineTo(-width * 0.12, hillHeight(-width * 0.12, horizon));
    for (let index = 0; index <= 40; index += 1) {
      const x = -width * 0.12 + (width * 1.24 * index / 40);
      hillShape.lineTo(x, hillHeight(x, horizon));
    }
    hillShape.lineTo(width * 1.12, 0);
    hillShape.closePath();

    const hillSurfaceMaterial = new THREE.MeshStandardMaterial({
      color: 0x07150f,
      roughness: 1,
      metalness: 0,
      side: THREE.DoubleSide,
    });
    const hillSideMaterial = new THREE.MeshStandardMaterial({
      color: 0x030a07,
      roughness: 1,
      metalness: 0,
      side: THREE.DoubleSide,
    });
    const hill = new THREE.Mesh(
      new THREE.ExtrudeGeometry(hillShape, {
        depth: 160,
        bevelEnabled: true,
        bevelSegments: 2,
        bevelSize: 3,
        bevelThickness: 5,
        curveSegments: 8,
      }),
      [hillSurfaceMaterial, hillSideMaterial]
    );
    // A espessura fica para trás da borda visível, revelando volume sem cobrir a árvore.
    hill.position.z = -168;
    landscape.add(hill);

    const edgePoints = [];
    for (let index = 0; index <= 80; index += 1) {
      const x = -width * 0.12 + (width * 1.24 * index / 80);
      edgePoints.push(new THREE.Vector3(x, hillHeight(x, horizon), -7));
    }
    landscape.add(new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(edgePoints),
      new THREE.LineBasicMaterial({ color: 0x17372a, transparent: true, opacity: 0.6 })
    ));

    const bladeCount = Math.min(2400, Math.max(1200, Math.floor(width * 1.55)));
    const bladeGeometry = new THREE.ConeGeometry(1.4, 1, 5);
    const bladePhases = new Float32Array(bladeCount);
    bladeGeometry.setAttribute("aPhase", new THREE.InstancedBufferAttribute(bladePhases, 1));
    grassMesh = new THREE.InstancedMesh(bladeGeometry, grassMaterial, bladeCount);
    const bladeTransform = new THREE.Object3D();
    const bladeColor = new THREE.Color();
    for (let index = 0; index < bladeCount; index += 1) {
      const row = index % 6;
      const stripIndex = Math.floor(index / 6);
      const stripCount = Math.ceil(bladeCount / 6);
      const x = -width * 0.10 + (width * 1.20 * stripIndex / stripCount) + (((index * 29) % 11) - 5);
      const groundY = hillHeight(x, horizon) - row * 5.5;
      const bladeHeight = 18 + ((index * 37) % 44);
      const bladeWidth = 0.72 + ((index * 23) % 8) * 0.07;
      const lean = ((index * 17) % 15) - 7;
      bladePhases[index] = index * 0.71 + row * 1.9;
      bladeTransform.position.set(x, groundY + bladeHeight * 0.5 - 1, -1.5 - row * 2.8);
      bladeTransform.rotation.set((row % 2) * 0.16, (index % 2) * Math.PI * 0.5, lean / Math.max(bladeHeight, 1));
      bladeTransform.scale.set(bladeWidth, bladeHeight, bladeWidth);
      bladeTransform.updateMatrix();
      grassMesh.setMatrixAt(index, bladeTransform.matrix);
      bladeColor.setHex([0x0a2a18, 0x123d23, 0x1a5129, 0x255c2c][index % 4]);
      grassMesh.setColorAt(index, bladeColor);
    }
    grassMesh.instanceMatrix.needsUpdate = true;
    grassMesh.instanceColor.needsUpdate = true;
    scene.add(grassMesh);
  }

  function createTree() {
    tree.clear();
    windBranches.length = 0;
    windLeaves.length = 0;
    const horizon = height * 0.405;
    const scale = Math.min(width / 1500, height / 830);
    tree.position.set(width * 0.485, hillHeight(width * 0.485, horizon), 0);
    tree.scale.set(scale * 1.12, scale * 1.04, 1);
    leafMaterial.uniforms.uCanopyCenter.value.set(tree.position.x, tree.position.y + 305 * tree.scale.y, 0);
    leafMaterial.uniforms.uCanopySize.value.set(210 * tree.scale.x, 180 * tree.scale.y, 72);
    leafMaterial.uniforms.uTrunkCenter.value.set(tree.position.x, tree.position.y, 0);
    leafMaterial.uniforms.uTrunkRadius.value = 36 * tree.scale.x;

    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(22, 36, 390, 10), treeMaterials[0]);
    trunk.position.set(0, 195, 0);
    trunk.rotation.z = -0.025;
    tree.add(trunk);

    function addFoliageCluster(parent, x, y, size, phase, materialOffset = 0, depth = 0) {
      const cluster = new THREE.Group();
      cluster.position.set(x, y, depth);
      const leaves = [
        [0, 0, 1, 1.0], [-size * 0.55, 2, 0.78, 0.82], [size * 0.55, -2, 0.82, 0.92],
        [-size * 0.18, size * 0.48, 0.72, 0.78], [size * 0.34, size * 0.42, 0.66, 0.76],
        [-size * 0.72, -size * 0.04, 0.6, 0.72], [size * 0.72, size * 0.05, 0.62, 0.74],
      ];
      leaves.forEach(([leafX, leafY, factor, depthFactor], leafIndex) => {
        const leaf = new THREE.Mesh(
          leafGeometry,
          leafMaterial
        );
        leaf.position.set(leafX, leafY, (leafIndex - 2) * size * 0.18);
        leaf.scale.set(size * factor * 1.82, size * factor * 0.62, size * factor * 0.20 * depthFactor);
        leaf.rotation.set(
          (leafIndex - 2) * 0.17,
          (materialOffset % 3 - 1) * 0.22,
          (leafIndex - 2) * 0.28
        );
        cluster.add(leaf);
      });
      parent.add(cluster);
      windLeaves.push({ node: cluster, baseY: y, phase, amount: 0.018 + (materialOffset % 2) * 0.012 });
    }

    const branchData = [
      [0, 118, 156, 156, 10, 0.3], [4, 157, 188, 29, 11, 1.1],
      [0, 196, 164, 146, 8, 2.0], [4, 232, 145, 40, 8, 2.7],
      [-2, 263, 113, 169, 7, 3.5], [6, 285, 102, 16, 7, 4.2],
      [5, 314, 78, 125, 6, 4.9], [6, 332, 68, 54, 5, 5.7],
    ];
    branchData.forEach(([x, y, length, angle, thickness, phase], index) => {
      const pivot = new THREE.Group();
      const angleInRadians = THREE.MathUtils.degToRad(angle);
      const depthAngle = ((index % 3) - 1) * 0.16;
      const direction = new THREE.Vector3(Math.cos(angleInRadians), Math.sin(angleInRadians), depthAngle).normalize();
      const baseAngle = 0;
      pivot.position.set(x, y, (index % 3 - 1) * 7);
      const branch = new THREE.Mesh(
        new THREE.CylinderGeometry(thickness * 0.82, thickness * 1.2, length, 7),
        treeMaterials[index % 2]
      );
      branch.position.copy(direction).multiplyScalar(length / 2);
      branch.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction);
      pivot.add(branch);
      tree.add(pivot);
      windBranches.push({ node: pivot, baseAngle, phase, amount: 0.025 + (index % 3) * 0.008 });

      const twigDirection = new THREE.Vector3(Math.cos(angleInRadians + 0.55), Math.sin(angleInRadians + 0.55), depthAngle * 1.4).normalize();
      const twig = new THREE.Mesh(new THREE.CylinderGeometry(thickness * 0.28, thickness * 0.5, length * 0.38, 5), treeMaterials[0]);
      twig.position.copy(direction).multiplyScalar(length * 0.73);
      twig.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), twigDirection);
      pivot.add(twig);

      [0.3, 0.48, 0.66, 0.82, 0.98].forEach((ratio, foliageIndex) => {
        const offset = ((index + foliageIndex) % 2 === 0 ? -1 : 1) * (8 + foliageIndex * 2);
        addFoliageCluster(
          pivot,
          length * ratio,
          offset,
          16 + (foliageIndex % 2) * 5,
          phase + foliageIndex * 0.8,
          index + foliageIndex,
          (foliageIndex - 1.5) * 8
        );
      });
    });

    const canopy = [
      [-126, 255, 48], [-105, 294, 62], [-80, 326, 58], [-50, 357, 67], [-15, 369, 69],
      [22, 370, 74], [59, 355, 68], [91, 326, 61], [120, 291, 50], [137, 258, 37],
      [-151, 226, 37], [-125, 244, 61], [-96, 263, 74], [-67, 285, 76], [-34, 302, 74],
      [3, 311, 80], [39, 302, 79], [71, 281, 74], [102, 253, 64], [130, 224, 39],
      [-112, 201, 39], [-84, 218, 62], [-51, 232, 71], [-16, 244, 76], [19, 245, 76],
      [55, 231, 68], [87, 211, 57], [111, 193, 34], [-73, 382, 36], [-40, 397, 43],
      [-4, 408, 50], [34, 401, 48], [67, 383, 38], [-149, 273, 30], [153, 274, 29],
      [-145, 309, 34], [145, 308, 33], [-116, 346, 45], [118, 346, 43],
      [-48, 421, 31], [5, 428, 35], [55, 416, 30],
    ];
    canopy.forEach(([x, y, radius], index) => {
      addFoliageCluster(tree, x, y, radius * 0.78, 0.5 + index * 0.15, index + 1, (index % 5 - 2) * 10);
    });

  }

  function createWind() {
    if (windParticles) {
      scene.remove(windParticles);
      windParticles.geometry.dispose();
      windParticles.material.dispose();
    }

    const particleCount = Math.min(220, Math.max(90, Math.floor(width * 0.16)));
    const particlePositions = new Float32Array(particleCount * 3);
    windParticleVelocities = new Float32Array(particleCount * 2);
    const horizon = height * 0.405;
    for (let index = 0; index < particleCount; index += 1) {
      const offset = index * 3;
      particlePositions[offset] = ((index * 97) % 1000) / 1000 * width;
      particlePositions[offset + 1] = horizon + (((index * 53) % 420) / 420) * height * 0.29;
      particlePositions[offset + 2] = -65;
      windParticleVelocities[index * 2] = 14 + ((index * 19) % 27);
      windParticleVelocities[index * 2 + 1] = Math.sin(index * 2.7) * 1.8;
    }
    const particleGeometry = new THREE.BufferGeometry();
    particleGeometry.setAttribute("position", new THREE.BufferAttribute(particlePositions, 3));
    windParticles = new THREE.Points(
      particleGeometry,
      new THREE.PointsMaterial({ color: 0xd6c59b, size: 2.2, transparent: true, opacity: 0.52, sizeAttenuation: false, depthTest: true, depthWrite: false })
    );
    scene.add(windParticles);

    flyingLeaves.forEach(({ node }) => {
      scene.remove(node);
      node.geometry.dispose();
      node.material.dispose();
    });
    flyingLeaves.splice(0, flyingLeaves.length);
    const leafColors = [0x6f8f55, 0x9d7a43, 0x3e6844, 0xb28a4c];
    for (let index = 0; index < 48; index += 1) {
      const generatedTexture = generatedFoliageTextures.length
        ? generatedFoliageTextures[(index * 3) % generatedFoliageTextures.length]
        : null;
      const leaf = new THREE.Mesh(
        new THREE.PlaneGeometry(7 + (index % 4) * 2, 3 + (index % 3)),
        new THREE.MeshStandardMaterial({
          map: generatedTexture,
          color: generatedTexture ? 0xffffff : leafColors[index % leafColors.length],
          transparent: true,
          alphaTest: 0.14,
          opacity: 0.82,
          roughness: 0.85,
          metalness: 0,
          depthTest: true,
          depthWrite: false,
          side: THREE.DoubleSide,
        })
      );
      leaf.visible = false;
      leaf.position.set(0, 0, 1.5);
      leaf.rotation.z = index * 0.9;
      scene.add(leaf);
      flyingLeaves.push({
        node: leaf,
        spin: 0.7 + (index % 5) * 0.18,
        phase: index * 0.8,
        active: false,
        life: 0,
        maxLife: 5 + (index % 4) * 0.7,
        velocityX: 0,
        velocityY: 0,
        velocityZ: 0,
        spinX: 0,
        spinY: 0,
        baseScale: 1,
        rigidBody: null,
        collider: null,
      });
    }
  }

  function createLeafPhysics() {
    if (leafPhysicsWorld && leafPhysicsWorld.free) leafPhysicsWorld.free();

    // Y positivo aponta para baixo na composição ortográfica da página.
    leafPhysicsWorld = new RAPIER.World({ x: 0, y: 2.3, z: 0 });
    const horizon = height * 0.405;
    // Centro do corpo da folha quando a esfera encosta no plano do chão.
    leafGroundY = horizon + 6.1 - 0.9 - 2.5;
    const groundBody = leafPhysicsWorld.createRigidBody(
      RAPIER.RigidBodyDesc.fixed().setTranslation(width * 0.5, horizon + 6.1, -7)
    );
    leafPhysicsWorld.createCollider(
      RAPIER.ColliderDesc.cuboid(width * 0.72, 0.9, 30)
        .setFriction(0.72)
        .setRestitution(0.08),
      groundBody
    );

    flyingLeaves.forEach((leaf) => {
      const body = leafPhysicsWorld.createRigidBody(
        RAPIER.RigidBodyDesc.dynamic()
          .setTranslation(0, -100, -20)
          .setLinearDamping(0.22)
          .setAngularDamping(0.38)
      );
      const collider = leafPhysicsWorld.createCollider(
        RAPIER.ColliderDesc.ball(2.5)
          .setDensity(0.18)
          .setFriction(0.46)
          .setRestitution(0.16),
        body
      );
      leaf.rigidBody = body;
      leaf.collider = collider;
    });
  }

  function launchFlyingLeaf(leaf, index, gustStrength) {
    // As folhas nascem atrás da copa, em alturas diferentes entre os galhos.
    const canopyOriginY = 190 + ((index * 83) % 211);
    getTreeWindTarget(treeWindTarget, -40, canopyOriginY);
    // Nascem atrás da copa, em uma área espalhada, e são levadas pelo vento.
    const windOriginX = treeWindTarget.x - 70 + ((index * 67) % 140);
    const launchY = treeWindTarget.y - 18 + ((index * 47) % 36);
    // Atrás da árvore, mas à frente da face da colina para continuarem visíveis.
    leaf.node.position.set(windOriginX, launchY, -5 - (index % 3) * 0.7);
    leaf.node.rotation.z = index * 0.9;
    leaf.node.visible = true;
    leaf.node.material.opacity = 0.82;
    leaf.active = true;
    leaf.life = 0;
    leaf.maxLife = 12 + (index % 4) * 0.8;
    leaf.fallStartY = launchY;
    leaf.groundY = leafGroundY;
    // Cada folha tem entre 5 e 10 segundos para chegar ao chão.
    const fallVariation = (index * 37) % 13;
    leaf.fallDuration = 5 + (fallVariation / 12) * 5;
    leaf.fallDirection = Math.sign(leaf.groundY - leaf.fallStartY) || 1;
    const dropHeight = Math.abs(leaf.groundY - leaf.fallStartY);
    const longFallFactor = (leaf.fallDuration - 5) / 5;
    // Nas quedas mais longas, a folha sobe até metade da altura do percurso
    // antes de começar a descer, como se fosse sustentada por uma rajada.
    leaf.fallLift = dropHeight * (0.18 + longFallFactor * 0.32) + gustStrength * 8;
    leaf.maxLife = leaf.fallDuration + 1.5;
    // A deriva é calculada pelo espaço disponível, para a folha continuar em
    // quadro até terminar a queda em vez de sumir pela lateral antes da hora.
    const availableWindTravel = Math.max(90, width - 90 - windOriginX);
    const windTravelRatio = 0.42 + ((index * 29) % 7) * 0.055;
    leaf.velocityX = availableWindTravel * windTravelRatio / leaf.fallDuration;
    // Impulso inicial para cima: a folha se desprende, sobe um pouco e depois cai.
    leaf.velocityY = -16 - gustStrength * 26 - (index % 5) * 2 + Math.sin(index * 2.4) * 1.5;
    leaf.velocityZ = 0;
    leaf.node.rotation.set(index * 0.31, index * 0.23, index * 0.9);
    leaf.spinX = 1.2 + (index % 4) * 0.22;
    leaf.spinY = 1.0 + (index % 5) * 0.19;
    leaf.baseScale = 2.34 + (index % 5) * 0.24;
    leaf.zigzagPhase = index * 1.73;
    leaf.zigzagFrequency = 1.55 + (index % 5) * 0.22;
    leaf.zigzagSpeed = 9 + (index % 6) * 2.6;
    leaf.flutterFrequency = 2.4 + (index % 5) * 0.37;
    leaf.flutterAmplitude = 4 + (index % 6) * 1.35;
    leaf.windResponse = 7 + (index % 5) * 2.2;

    if (leaf.rigidBody) {
      leaf.rigidBody.setTranslation({
        x: windOriginX,
        y: leaf.node.position.y,
        z: leaf.node.position.z,
      }, true);
      leaf.rigidBody.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
      leaf.rigidBody.setLinvel({
        x: leaf.velocityX,
        y: leaf.velocityY,
        z: leaf.velocityZ,
      }, true);
      leaf.rigidBody.setAngvel({
        x: leaf.spinX,
        y: leaf.spinY,
        z: leaf.spin,
      }, true);
      leaf.rigidBody.wakeUp();
    }
  }

  function launchLeafBurst(gustStrength, maximum, timestamp, force = false) {
    let launched = 0;
    const startIndex = force
      ? Math.floor(timestamp * 11) % flyingLeaves.length
      : 0;
    for (let offset = 0; offset < flyingLeaves.length && launched < maximum; offset += 1) {
      const index = (startIndex + offset) % flyingLeaves.length;
      // Nem mesmo uma rajada forte teleporta de volta para a copa uma folha
      // que já está no meio da queda.
      if (!flyingLeaves[index].active) {
        launchFlyingLeaf(flyingLeaves[index], index + Math.floor(timestamp * 3), gustStrength);
        launched += 1;
      }
    }
    if (launched > 0) lastLeafBurst = timestamp;
  }

  createLandscape();
  createTree();
  createWind();
  createLeafPhysics();
  createFireflies();
  createSkyCreatures();

  let pointerX = 0;
  let pointerY = 0;
  window.addEventListener("pointermove", (event) => {
    pointerX = (event.clientX / window.innerWidth - 0.5) * 2;
    pointerY = (event.clientY / window.innerHeight - 0.5) * 2;
  }, { passive: true });

  function resize() {
    width = window.innerWidth;
    height = window.innerHeight;
    camera.right = width;
    camera.top = height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
    skyPlane.position.set(width / 2, height / 2, -20);
    skyPlane.scale.set(width * 1.12, height * 1.12, 1);
    skyMaterial.uniforms.uResolution.value.set(width, height);
    warmLight.position.set(width * 0.58, height * 0.67, 230);
    rimLight.position.set(width * 0.12, height * 0.85, 150);
    positionLensFlare();
    createLandscape();
    createTree();
    createWind();
    createLeafPhysics();
    createFireflies();
    createSkyCreatures();
  }
  window.addEventListener("resize", resize, { passive: true });

  const clock = new THREE.Clock();
  function render() {
    const elapsed = clock.getElapsedTime();
    const delta = prefersReducedMotion ? 0 : Math.min(clock.getDelta(), 0.05);
    skyMaterial.uniforms.uTime.value = prefersReducedMotion ? 0 : elapsed;
    leafMaterial.uniforms.uTime.value = prefersReducedMotion ? 0 : elapsed;
    const windTime = prefersReducedMotion ? 0 : elapsed;
    // O vento nunca zera: existe um fluxo constante e a onda acrescenta as rajadas.
    const gustPulse = Math.pow(Math.max(0, Math.sin(elapsed * 0.68 + 0.4)), 8);
    const naturalGust = prefersReducedMotion ? 0 : 0.22 + gustPulse * 0.78;
    const gustStrength = Math.max(naturalGust, staticInterference);
    postStaticSway = Math.max(0, postStaticSway - delta / 3.4);
    if (grassShader) {
      grassShader.uniforms.uTime.value = windTime;
      grassShader.uniforms.uGust.value = gustStrength;
    }
    const bodycamX = prefersReducedMotion ? 0 : Math.sin(elapsed * 0.44) * 8.0 + Math.sin(elapsed * 1.31) * 2.1;
    const bodycamY = prefersReducedMotion ? 0 : Math.sin(elapsed * 0.57 + 0.8) * 5.8 + Math.sin(elapsed * 1.08) * 1.6;
    camera.position.x = bodycamX + pointerX * 1.5;
    camera.position.y = bodycamY + pointerY * 0.9;
    camera.rotation.x = -0.045 + Math.sin(elapsed * 0.57 + 0.8) * 0.014 + pointerY * 0.004;
    camera.rotation.y = Math.sin(elapsed * 0.39) * 0.008 + pointerX * 0.003;
    camera.rotation.z = Math.sin(elapsed * 0.28) * 0.006 + pointerX * 0.002;
    lensFlareSprites.forEach((sprite, index) => {
      const pulse = 0.94 + Math.sin(elapsed * (0.55 + index * 0.07) + index) * 0.06;
      sprite.scale.setScalar(sprite.userData.size * pulse);
      sprite.material.opacity = sprite.userData.opacity * (0.94 + Math.sin(elapsed * 0.7 + index) * 0.06);
    });
    fireflies.forEach(({ node, baseX, baseY, phase, driftX, driftY, speed, size }) => {
      const blinkWave = Math.max(0, Math.sin(elapsed * speed + phase));
      const blink = Math.pow(blinkWave, 2.2);
      const brightness = 0.06 + blink * 0.94;
      node.position.x = baseX + Math.sin(elapsed * 0.34 + phase) * driftX + Math.cos(elapsed * 0.71 + phase) * 3;
      node.position.y = baseY + Math.cos(elapsed * 0.43 + phase) * driftY + Math.sin(elapsed * 0.82 + phase) * 2;
      node.scale.setScalar(size * (0.48 + brightness * 0.92));
      node.material.opacity = 0.03 + brightness * 0.97;
    });
    birds.forEach(({ node, phase, speed, size, arc }) => {
      node.position.x += speed * delta;
      node.position.y += Math.sin(elapsed * 0.75 + phase) * arc * delta;
      node.scale.y = size * (0.82 + Math.abs(Math.sin(elapsed * 3.2 + phase)) * 0.28);
      if (node.position.x > width + 160) node.position.x = -180;
    });
    bats.forEach(({ node, phase, speed, size, arc }) => {
      node.position.x -= speed * delta;
      node.position.y += Math.sin(elapsed * 0.66 + phase) * arc * delta;
      node.scale.y = size * (0.76 + Math.abs(Math.sin(elapsed * 4.5 + phase)) * 0.34);
      if (node.position.x < -180) node.position.x = width + 180;
    });
    insects.forEach(({ node, baseX, baseY, phase, size, drift, speed }) => {
      node.position.x = baseX + Math.sin(elapsed * speed + phase) * drift;
      node.position.y = baseY + Math.cos(elapsed * speed * 1.23 + phase) * drift * 0.72;
      node.scale.setScalar(size * (0.72 + 0.42 * (0.5 + 0.5 * Math.sin(elapsed * speed * 1.6 + phase))));
      node.material.opacity = 0.18 + 0.54 * (0.5 + 0.5 * Math.sin(elapsed * speed * 1.6 + phase));
    });
    windBranches.forEach(({ node, baseAngle, phase, amount }) => {
      const gustAmount = amount * (1.0 + gustStrength * 3.0);
      node.rotation.z = baseAngle + Math.sin(windTime * 1.4 + phase) * gustAmount + Math.sin(windTime * 0.67 + phase * 1.7) * gustAmount * 0.35;
    });
    windLeaves.forEach(({ node, baseY, phase, amount }) => {
      const gustAmount = amount * (1.0 + gustStrength * 3.4);
      node.rotation.z = Math.sin(windTime * 1.55 + phase) * gustAmount;
      node.position.y = baseY + Math.sin(windTime * 1.55 + phase) * (1.5 + gustStrength * 4.5);
    });
    const aftershock = postStaticSway * Math.sin(windTime * 2.7 + 0.4);
    tree.position.x = width * 0.485 + pointerX * 7 + aftershock * 2.2;
    tree.position.y = hillHeight(width * 0.485, height * 0.405) + pointerY * 2 + postStaticSway * Math.cos(windTime * 2.35) * 0.9;
    leafMaterial.uniforms.uCanopyCenter.value.set(tree.position.x, tree.position.y + 305 * tree.scale.y, 0);
    leafMaterial.uniforms.uTrunkCenter.value.set(tree.position.x, tree.position.y, 0);
    const treeLean = prefersReducedMotion ? 0 : Math.sin(windTime * 0.57 + 0.8) * 0.009 + gustStrength * 0.035 + aftershock * 0.028;
    tree.rotation.z = pointerX * 0.004 + treeLean;
    if (grassMesh) grassMesh.position.x = pointerX * 4;

    if (windParticles && windParticleVelocities) {
      const positions = windParticles.geometry.attributes.position.array;
      const horizon = height * 0.405;
      for (let index = 0; index < windParticleVelocities.length / 2; index += 1) {
        const offset = index * 3;
        const particleSpeed = windParticleVelocities[index * 2] + gustStrength * 95;
        positions[offset] += particleSpeed * delta;
        positions[offset + 1] += windParticleVelocities[index * 2 + 1] * delta
          + Math.sin(elapsed * 1.2 + index) * 0.08;
        if (positions[offset] > width + 12) {
          positions[offset] = -12;
          positions[offset + 1] = horizon + ((index * 53) % 420) / 420 * height * 0.29;
        }
      }
      windParticles.geometry.attributes.position.needsUpdate = true;
    }

    if (gustStrength > 0.16 && elapsed - lastLeafBurst > 1.8) {
      launchLeafBurst(gustStrength, staticInterference ? 16 : 12, elapsed);
    }

    if (leafPhysicsWorld) {
      leafPhysicsWorld.integrationParameters.dt = Math.min(Math.max(delta, 1 / 120), 1 / 30);
      flyingLeaves.forEach((leaf) => {
        if (!leaf.active || !leaf.rigidBody) return;
        const body = leaf.rigidBody;
        const translation = body.translation();
        const timeToGround = Math.max(0.25, leaf.fallDuration - leaf.life);
        const roomToEdge = Math.max(0, width + 70 - translation.x);
        const safeWindSpeed = roomToEdge / timeToGround;
        const flutterSpeed = Math.sin(elapsed * leaf.zigzagFrequency + leaf.zigzagPhase) * leaf.zigzagSpeed;
        const gustPush = gustStrength * leaf.windResponse;
        const requestedWindSpeed = leaf.velocityX + flutterSpeed + gustPush;
        body.setLinvel({
          // A rajada acelera a folha, mas não a expulsa do quadro antes de ela
          // completar a trajetória vertical.
          x: Math.min(requestedWindSpeed, Math.max(4, safeWindSpeed)),
          // A altura é aplicada pela trajetória sincronizada após o passo físico.
          y: 0,
          z: 0,
        }, true);
        body.setAngvel({
          x: leaf.spinX + gustStrength * 0.8,
          y: leaf.spinY + Math.sin(elapsed * 1.7 + leaf.phase) * 0.7,
          z: leaf.spin + Math.cos(elapsed * leaf.flutterFrequency + leaf.zigzagPhase) * 1.2,
        }, true);
      });
      leafPhysicsWorld.step();
    }

    flyingLeaves.forEach((leaf) => {
      if (!leaf.active) return;
      leaf.life += delta;
      if (!leaf.rigidBody) return;
      let translation = leaf.rigidBody.translation();
      const fallProgress = Math.min(1, Math.max(0, leaf.life / leaf.fallDuration));
      const risePhase = 0.18;
      const riseProgress = Math.min(1, fallProgress / risePhase);
      const descentProgress = Math.min(1, Math.max(0, (fallProgress - risePhase) / (1 - risePhase)));
      const easedRise = riseProgress * riseProgress * (3 - 2 * riseProgress);
      const easedDescent = descentProgress * descentProgress * (3 - 2 * descentProgress);
      const peakY = leaf.fallStartY - leaf.fallDirection * leaf.fallLift;
      const baseTargetY = fallProgress < risePhase
        ? THREE.MathUtils.lerp(leaf.fallStartY, peakY, easedRise)
        : THREE.MathUtils.lerp(peakY, leaf.groundY, easedDescent);
      const airEnvelope = Math.sin(Math.PI * fallProgress);
      const verticalFlutter = Math.sin(
        elapsed * leaf.flutterFrequency + leaf.zigzagPhase
      ) * leaf.flutterAmplitude * airEnvelope;
      const gustLift = -leaf.fallDirection * gustStrength * leaf.windResponse * airEnvelope;
      const targetY = baseTargetY + verticalFlutter + gustLift;
      // O corpo continua sendo do Rapier; a sincronização vertical evita que
      // o plano de colisão impeça a folha de completar sua queda visível.
      leaf.rigidBody.setTranslation({
        x: translation.x,
        y: targetY,
        z: translation.z,
      }, true);
      leaf.rigidBody.setLinvel({ x: leaf.rigidBody.linvel().x, y: 0, z: 0 }, true);
      translation = leaf.rigidBody.translation();
      const rotation = leaf.rigidBody.rotation();
      leaf.node.position.set(translation.x, translation.y, translation.z);
      // A folha continua sendo um objeto físico, mas o plano visual acompanha
      // a câmera para não ficar de lado quando o corpo gira em 3D. O giro em Z
      // do corpo vira o roll visual do sprite.
      leafPhysicsQuaternion.set(rotation.x, rotation.y, rotation.z, rotation.w);
      leafPhysicsEuler.setFromQuaternion(leafPhysicsQuaternion, "YXZ");
      leafBillboardQuaternion.copy(camera.quaternion);
      leafRollQuaternion.setFromAxisAngle(leafRollAxis, leafPhysicsEuler.z);
      leaf.node.quaternion.copy(leafBillboardQuaternion).multiply(leafRollQuaternion);
      leaf.node.scale.setScalar(leaf.baseScale);
      const lifeFade = Math.min(1, Math.max(0, (leaf.maxLife - leaf.life) / 0.8));
      leaf.node.material.opacity = 0.62 * lifeFade;
      const finishedFalling = leaf.life >= leaf.fallDuration;
      if (leaf.life >= leaf.maxLife || (finishedFalling && leaf.node.position.x > width + 120)) {
        leaf.active = false;
        leaf.node.visible = false;
        leaf.rigidBody.setTranslation({ x: 0, y: -100, z: -20 }, true);
        leaf.rigidBody.setLinvel({ x: 0, y: 0, z: 0 }, true);
      }
    });
    renderer.render(scene, camera);
    if (!prefersReducedMotion) window.requestAnimationFrame(render);
  }
  render();

  const interference = document.querySelector("#image-interference");
  if (interference && !prefersReducedMotion) {
    const triggerInterference = () => {
      staticInterference = 1;
      launchLeafBurst(1, 16, clock.getElapsedTime(), true);
      interference.style.setProperty("--glitch-x", `${Math.round((Math.random() - 0.5) * 24)}px`);
      interference.style.setProperty("--glitch-y", `${Math.round((Math.random() - 0.5) * 14)}px`);
      interference.style.setProperty("--glitch-skew", `${((Math.random() - 0.5) * 1.8).toFixed(2)}deg`);
      interference.classList.remove("active");
      void interference.offsetWidth;
      interference.classList.add("active");
      window.setTimeout(() => {
        staticInterference = 0;
        postStaticSway = 1;
        interference.classList.remove("active");
      }, 1000);
      window.setTimeout(triggerInterference, 5000 + Math.random() * 35000);
    };
    window.setTimeout(triggerInterference, 2600 + Math.random() * 3800);
  }
}
