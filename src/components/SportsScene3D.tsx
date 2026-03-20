import { useRef, useEffect } from "react";
import * as THREE from "three";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";

interface SportsScene3DProps {
  className?: string;
  mouse: { x: number; y: number };
}

export function SportsScene3D({ className, mouse }: SportsScene3DProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<{
    renderer: THREE.WebGLRenderer;
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    models: { mesh: THREE.Object3D; type: "football" | "bat" | "shuttle"; basePos: THREE.Vector3 }[];
    animId: number;
    mouse: { x: number; y: number };
    smoothMouse: { x: number; y: number };
  } | null>(null);

  useEffect(() => {
    if (sceneRef.current) {
      sceneRef.current.mouse = mouse;
    }
  }, [mouse]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    /* ═══ Scene ═══ */
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(
      40,
      container.clientWidth / container.clientHeight,
      0.1,
      100
    );
    camera.position.set(0, 0.2, 5.5);
    camera.lookAt(0, 0.1, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    container.appendChild(renderer.domElement);

    /* ═══ Lighting — Premium multi-layer setup ═══ */

    // Ambient fill — very subtle
    scene.add(new THREE.AmbientLight(0xffffff, 0.2));

    // Main key light — warm white from top-right
    const keyLight = new THREE.DirectionalLight(0xfff5e6, 1.4);
    keyLight.position.set(2, 4, 4);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(1024, 1024);
    keyLight.shadow.camera.near = 0.5;
    keyLight.shadow.camera.far = 20;
    keyLight.shadow.camera.left = -3;
    keyLight.shadow.camera.right = 3;
    keyLight.shadow.camera.top = 3;
    keyLight.shadow.camera.bottom = -3;
    keyLight.shadow.bias = -0.002;
    keyLight.shadow.radius = 4;
    scene.add(keyLight);

    // Fill light — cool blue from left
    const fillLight = new THREE.DirectionalLight(0xb0d4f1, 0.4);
    fillLight.position.set(-3, 2, 2);
    scene.add(fillLight);

    // Rim/back light — for edge highlights (green accent)
    const rimLight = new THREE.DirectionalLight(0x10b981, 0.9);
    rimLight.position.set(-1, 1, -3);
    scene.add(rimLight);

    // Strong top-left highlight on football
    const topLeftHighlight = new THREE.SpotLight(0xffffff, 2.5, 8, Math.PI / 5, 0.7, 1);
    topLeftHighlight.position.set(-2, 3, 3);
    topLeftHighlight.target.position.set(-0.25, 0, 0);
    scene.add(topLeftHighlight);
    scene.add(topLeftHighlight.target);

    // Green accent glow behind football — larger & more diffused
    const heroGlow = new THREE.PointLight(0x10b981, 4, 7, 1.2);
    heroGlow.position.set(-0.15, 0, -1.5);
    scene.add(heroGlow);

    // Warm accent for bat (close to center)
    const batGlow = new THREE.PointLight(0xeab308, 1.0, 3.5, 1.5);
    batGlow.position.set(0.1, 0.7, -0.5);
    scene.add(batGlow);

    // Cool accent for shuttle — reduced intensity
    const shuttleGlow = new THREE.PointLight(0x3b82f6, 0.5, 3, 1.5);
    shuttleGlow.position.set(0.5, -0.6, 1);
    scene.add(shuttleGlow);

    // Spot for dramatic highlight on football
    const heroSpot = new THREE.SpotLight(0xffffff, 2.5, 8, Math.PI / 6, 0.6, 1);
    heroSpot.position.set(-0.5, 3, 3);
    heroSpot.target.position.set(-0.25, -0.05, 0);
    heroSpot.castShadow = true;
    heroSpot.shadow.mapSize.set(512, 512);
    heroSpot.shadow.radius = 3;
    scene.add(heroSpot);
    scene.add(heroSpot.target);

    // Shadow-catching ground plane (invisible, receives shadows)
    const groundGeo = new THREE.PlaneGeometry(10, 10);
    const groundMat = new THREE.ShadowMaterial({ opacity: 0.25 });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -1.2;
    ground.receiveShadow = true;
    scene.add(ground);

    /* ═══ Ref data ═══ */
    const refData = {
      renderer, scene, camera,
      models: [] as { mesh: THREE.Object3D; type: "football" | "bat" | "shuttle"; basePos: THREE.Vector3 }[],
      animId: 0,
      mouse: { x: 0, y: 0 },
      smoothMouse: { x: 0, y: 0 },
    };
    sceneRef.current = refData;

    /* ═══ Helpers ═══ */
    function normalizeModel(obj: THREE.Object3D, targetSize: number): THREE.Group {
      const group = new THREE.Group();
      group.add(obj);
      const box = new THREE.Box3().setFromObject(obj);
      const size = box.getSize(new THREE.Vector3());
      const maxDim = Math.max(size.x, size.y, size.z);
      if (maxDim === 0) return group;
      const scale = targetSize / maxDim;
      obj.scale.setScalar(scale);
      const center = box.getCenter(new THREE.Vector3()).multiplyScalar(scale);
      obj.position.sub(center);
      return group;
    }

    function applyPremiumMaterial(obj: THREE.Object3D, baseColor: string, accentColor: string, roughness = 0.4, metalness = 0.15) {
      obj.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
          const m = child as THREE.Mesh;
          m.castShadow = true;
          m.receiveShadow = true;
          m.material = new THREE.MeshPhysicalMaterial({
            color: baseColor,
            roughness,
            metalness,
            emissive: accentColor,
            emissiveIntensity: 0.1,
            clearcoat: 0.3,
            clearcoatRoughness: 0.25,
            envMapIntensity: 0.8,
          });
        }
      });
    }

    /* ═══ Load models — TIGHT GROUPED COMPOSITION ═══
     *
     *  Football:    center, z=0       (main hero, largest)
     *  Cricket bat: slightly behind & above, partially hidden by football
     *  Shuttlecock: slightly in front & below, overlapping football
     */

    const objLoader = new OBJLoader();
    const fbxLoader = new FBXLoader();

    // ─── Football (center hero) ───
    // Shift entire group left for better text/visual balance
    const footballPos = new THREE.Vector3(-0.25, -0.05, 0);
    objLoader.load(
      "/football.obj",
      (obj) => {
        applyPremiumMaterial(obj, "#e0e0e0", "#10b981", 0.28, 0.15);
        const group = normalizeModel(obj, 1.15);
        group.position.copy(footballPos);
        group.scale.setScalar(0);
        scene.add(group);
        refData.models.push({ mesh: group, type: "football", basePos: footballPos.clone() });
      },
      undefined,
      (err) => {
        console.warn("Football fallback:", err);
        const geo = new THREE.IcosahedronGeometry(0.52, 3);
        const mat = new THREE.MeshPhysicalMaterial({ color: "#e0e0e0", roughness: 0.28, metalness: 0.15, emissive: "#10b981", emissiveIntensity: 0.1, clearcoat: 0.3 });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.castShadow = true;
        mesh.position.copy(footballPos);
        mesh.scale.setScalar(0);
        scene.add(mesh);
        refData.models.push({ mesh, type: "football", basePos: footballPos.clone() });
      }
    );

    // ─── Cricket bat (behind & above, top-right) ───
    const batPos = new THREE.Vector3(0.1, 0.55, -0.8);
    fbxLoader.load(
      "/cricket-bat.fbx",
      (obj) => {
        applyPremiumMaterial(obj, "#c9a063", "#b8860b", 0.5, 0.08);
        const group = normalizeModel(obj, 0.85);
        group.position.copy(batPos);
        group.rotation.z = -0.4; // natural diagonal angle
        group.scale.setScalar(0);
        scene.add(group);
        refData.models.push({ mesh: group, type: "bat", basePos: batPos.clone() });
      },
      undefined,
      (err) => {
        console.warn("Bat fallback:", err);
        const group = new THREE.Group();
        const blade = new THREE.Mesh(
          new THREE.BoxGeometry(0.22, 0.75, 0.06),
          new THREE.MeshPhysicalMaterial({ color: "#c9a063", roughness: 0.5, metalness: 0.08, emissive: "#b8860b", emissiveIntensity: 0.12, clearcoat: 0.1 })
        );
        blade.position.y = 0.12;
        blade.castShadow = true;
        group.add(blade);
        const handle = new THREE.Mesh(
          new THREE.CylinderGeometry(0.04, 0.04, 0.4, 8),
          new THREE.MeshPhysicalMaterial({ color: "#5a3e1b", roughness: 0.6, metalness: 0.05, emissive: "#b8860b", emissiveIntensity: 0.06 })
        );
        handle.position.y = -0.35;
        handle.castShadow = true;
        group.add(handle);
        group.position.copy(batPos);
        group.rotation.z = -0.4;
        group.scale.setScalar(0);
        scene.add(group);
        refData.models.push({ mesh: group, type: "bat", basePos: batPos.clone() });
      }
    );

    // ─── Shuttlecock (in front & lower, bottom-right) ───
    // Shuttle: slightly outside ball, forward, only 5-10% overlap
    const shuttlePos = new THREE.Vector3(0.55, -0.55, 0.7);
    fbxLoader.load(
      "/shuttlecock.fbx",
      (obj) => {
        applyPremiumMaterial(obj, "#d8d8d8", "#2563eb", 0.35, 0.06);
        const group = normalizeModel(obj, 0.65);
        group.position.copy(shuttlePos);
        group.scale.setScalar(0);
        scene.add(group);
        refData.models.push({ mesh: group, type: "shuttle", basePos: shuttlePos.clone() });
      },
      undefined,
      (err) => {
        console.warn("Shuttle fallback:", err);
        const group = new THREE.Group();
        const cork = new THREE.Mesh(
          new THREE.SphereGeometry(0.1, 16, 16),
          new THREE.MeshPhysicalMaterial({ color: "#f0e6d0", roughness: 0.4, metalness: 0.05, emissive: "#ef4444", emissiveIntensity: 0.08 })
        );
        cork.position.y = -0.15;
        cork.castShadow = true;
        group.add(cork);
        const cone = new THREE.Mesh(
          new THREE.ConeGeometry(0.28, 0.45, 16, 1, true),
          new THREE.MeshPhysicalMaterial({ color: "#f0f0f0", roughness: 0.3, metalness: 0.05, emissive: "#3b82f6", emissiveIntensity: 0.1, side: THREE.DoubleSide, transparent: true, opacity: 0.85 })
        );
        cone.position.y = 0.1;
        cone.castShadow = true;
        group.add(cone);
        group.position.copy(shuttlePos);
        group.scale.setScalar(0);
        scene.add(group);
        refData.models.push({ mesh: group, type: "shuttle", basePos: shuttlePos.clone() });
      }
    );

    /* ═══ Animation loop ═══ */
    const startTime = Date.now();

    function animate() {
      refData.animId = requestAnimationFrame(animate);
      const t = (Date.now() - startTime) / 1000;

      // Smooth mouse interpolation (spring-like)
      refData.smoothMouse.x += (refData.mouse.x - refData.smoothMouse.x) * 0.05;
      refData.smoothMouse.y += (refData.mouse.y - refData.smoothMouse.y) * 0.05;

      // Pulsing glow lights
      heroGlow.intensity = 4 + Math.sin(t * 0.6) * 0.6;
      batGlow.intensity = 1.0 + Math.sin(t * 0.9) * 0.2;
      shuttleGlow.intensity = 0.5 + Math.sin(t * 0.7) * 0.1;

      for (const item of refData.models) {
        const { mesh, type, basePos } = item;

        // Staggered fade-in
        const fadeDelay = type === "football" ? 0.2 : type === "bat" ? 0.5 : 0.8;
        const fadeProgress = Math.min(1, Math.max(0, (t - fadeDelay) / 0.7));
        const eased = 1 - Math.pow(1 - fadeProgress, 3);

        if (type === "football") {
          // Slow continuous Y rotation (~10s loop)
          mesh.rotation.y = t * 0.55;
          // Very subtle float
          mesh.position.y = basePos.y + Math.sin(t * 0.7) * 0.025;
          // Anchored parallax (main object = least movement, group anchor)
          mesh.position.x = basePos.x + refData.smoothMouse.x * 0.03;
          mesh.position.z = basePos.z + refData.smoothMouse.y * 0.02;
          mesh.scale.setScalar(eased);

        } else if (type === "bat") {
          // Gentle floating + tilt (slightly different rhythm than football)
          mesh.position.y = basePos.y + Math.sin(t * 1.0) * 0.04;
          mesh.rotation.z = -0.4 + Math.sin(t * 0.8) * 0.04;
          mesh.rotation.x = Math.sin(t * 0.6) * 0.03;
          // Behind = slightly more parallax shift
          mesh.position.x = basePos.x + refData.smoothMouse.x * 0.05;
          mesh.position.z = basePos.z + refData.smoothMouse.y * 0.035;
          mesh.scale.setScalar(eased);

        } else if (type === "shuttle") {
          // Light floating with tiny side drift
          mesh.position.y = basePos.y + Math.sin(t * 1.3) * 0.03;
          mesh.position.x = basePos.x + Math.sin(t * 0.6) * 0.015;
          mesh.rotation.y = Math.sin(t * 0.4) * 0.06;
          // Most parallax (in front = strongest depth illusion)
          mesh.position.x = basePos.x + Math.sin(t * 0.6) * 0.015 + refData.smoothMouse.x * 0.06;
          mesh.position.z = basePos.z + refData.smoothMouse.y * 0.045;
          mesh.scale.setScalar(eased);
        }
      }

      renderer.render(scene, camera);
    }
    animate();

    /* ═══ Resize ═══ */
    function onResize() {
      if (!container) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    }
    window.addEventListener("resize", onResize);

    /* ═══ Cleanup ═══ */
    return () => {
      window.removeEventListener("resize", onResize);
      cancelAnimationFrame(refData.animId);
      renderer.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
      sceneRef.current = null;
    };
  }, []);

  return (
    <div ref={containerRef} className={`${className} relative`}>
      {/* Radial glow behind the 3D scene — CSS overlay */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: "radial-gradient(ellipse 55% 50% at 48% 45%, rgba(16,185,129,0.16) 0%, rgba(16,185,129,0.06) 40%, transparent 68%)",
        }}
      />
    </div>
  );
}
