"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";

export function SketchRevolvePreview({ positions }: { positions: number[] | null }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !positions?.length) return;
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = true;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(34, 1, 0.01, 5000);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.computeVertexNormals();
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    const material = new THREE.MeshStandardMaterial({ color: "#8ccf79", roughness: 0.68, metalness: 0.02, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
    scene.add(new THREE.HemisphereLight("#ffffff", "#b7cadd", 2.2));
    const key = new THREE.DirectionalLight("#ffffff", 3.2);
    key.position.set(-3, 5, 4);
    key.castShadow = true;
    scene.add(key);
    const fill = new THREE.DirectionalLight("#b9ddff", 1.2);
    fill.position.set(4, 2, -3);
    scene.add(fill);

    const bounds = geometry.boundingBox ?? new THREE.Box3().setFromObject(mesh);
    const center = bounds.getCenter(new THREE.Vector3());
    const radius = Math.max(1, geometry.boundingSphere?.radius ?? 1);
    camera.position.set(center.x + radius * 1.8, center.y + radius * 1.2, center.z + radius * 2.1);
    camera.lookAt(center);
    camera.near = Math.max(0.01, radius / 100);
    camera.far = radius * 20;
    camera.updateProjectionMatrix();

    const render = () => {
      const width = Math.max(1, canvas.clientWidth);
      const height = Math.max(1, canvas.clientHeight);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.render(scene, camera);
    };
    render();
    const observer = new ResizeObserver(render);
    observer.observe(canvas);
    return () => {
      observer.disconnect();
      geometry.dispose();
      material.dispose();
      renderer.dispose();
    };
  }, [positions]);

  return (
    <aside className="sketch-revolve-preview" aria-label="Revolve 3D preview">
      <div className="sketch-revolve-preview-title">3D preview</div>
      {positions?.length ? <canvas ref={canvasRef} /> : <div className="sketch-revolve-preview-empty">Draw a profile left of the axis</div>}
    </aside>
  );
}
