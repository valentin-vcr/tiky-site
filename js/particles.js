/* ==========================================================
   TIKY — WebGL particle field
   Particles morph between shapes (logo, €, shield…) as the
   user scrolls. Exposes window.TikyParticles.
   ========================================================== */
window.TikyParticles = (() => {
  const LOGO_POLYS = [
    [[92,118],[460,118],[92,440]],
    [[460,118],[705,118],[955,435],[705,435]],
    [[262,435],[572,826],[262,826]],
    [[708,435],[708,826],[572,826],[485,712],[540,645]],
    [[270,285],[460,118],[590,285]],
    [[262,435],[420,435],[420,635]],
    [[540,435],[708,435],[540,645]],
  ];

  let renderer, scene, camera, points, geo, mat;
  let N, from, to, rand;
  let current = null, morphTween = null;
  const progress = { v: 1 };
  const shapes = {};
  const mouseNdc = { x: 0, y: 0 };
  const mouseWorld = new THREE.Vector3(99, 99, 0);
  const mouseSmooth = new THREE.Vector3(99, 99, 0);
  const group = new THREE.Group();
  let started = false;

  const isMobile = () => innerWidth < 760;

  // ---------- Shape sampling ----------
  function sampleCanvas(draw, n, { depth = 0.3, scale = 3.6 } = {}) {
    const S = 512;
    const c = document.createElement('canvas');
    c.width = c.height = S;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#fff';
    draw(ctx, S);
    const data = ctx.getImageData(0, 0, S, S).data;
    const px = [];
    for (let y = 0; y < S; y += 2)
      for (let x = 0; x < S; x += 2)
        if (data[(y * S + x) * 4 + 3] > 128) px.push(x, y);
    const out = new Float32Array(n * 3);
    const count = px.length / 2;
    for (let i = 0; i < n; i++) {
      const k = ((Math.random() * count) | 0) * 2;
      out[i * 3]     = ((px[k] + Math.random() * 2) / S - 0.5) * scale;
      out[i * 3 + 1] = -((px[k + 1] + Math.random() * 2) / S - 0.5) * scale;
      out[i * 3 + 2] = (Math.random() - 0.5) * depth;
    }
    return out;
  }

  function buildShapes() {
    shapes.logo = sampleCanvas((ctx, S) => {
      const s = 430 / 890, ox = (S - 890 * s) / 2 - 80 * s, oy = (S - 740 * s) / 2 - 100 * s;
      LOGO_POLYS.forEach(poly => {
        ctx.beginPath();
        poly.forEach(([x, y], i) => (i ? ctx.lineTo : ctx.moveTo).call(ctx, ox + x * s, oy + y * s));
        ctx.closePath();
        ctx.fill();
      });
    }, N, { depth: 0.45, scale: 3.3 });

    shapes.euro = sampleCanvas((ctx, S) => {
      ctx.font = '900 400px Unbounded, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('€', S / 2, S / 2 + 20);
    }, N, { depth: 0.5, scale: 3.4 });

    shapes.shield = sampleCanvas((ctx, S) => {
      const c = S / 2;
      ctx.beginPath();
      ctx.moveTo(c, 40);
      ctx.bezierCurveTo(c + 90, 90, c + 160, 90, c + 180, 92);
      ctx.bezierCurveTo(c + 185, 300, c + 120, 410, c, 470);
      ctx.bezierCurveTo(c - 120, 410, c - 185, 300, c - 180, 92);
      ctx.bezierCurveTo(c - 160, 90, c - 90, 90, c, 40);
      ctx.fill();
      ctx.globalCompositeOperation = 'destination-out';
      ctx.lineWidth = 34; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(c - 80, 255); ctx.lineTo(c - 18, 318); ctx.lineTo(c + 88, 196);
      ctx.stroke();
    }, N, { depth: 0.6, scale: 3.3 });

    shapes.tiky = sampleCanvas((ctx, S) => {
      ctx.font = '900 150px Unbounded, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('TIKY', S / 2, S / 2);
    }, N, { depth: 0.3, scale: 6 });

    // Spiral galaxy, seen at an angle
    const g = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      const r = Math.pow(Math.random(), 0.55) * 3.4 + 0.15;
      const arm = (i % 3) * (Math.PI * 2 / 3);
      const a = arm + r * 1.35 + (Math.random() - 0.5) * (0.9 / (r + 0.4));
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      const y = (Math.random() - 0.5) * 0.18 * (1.2 - r / 4);
      g[i * 3] = x; g[i * 3 + 1] = y + z * 0.32; g[i * 3 + 2] = z * 0.9 - y * 0.32;
    }
    shapes.galaxy = g;

    // Chaos: a loose, wide cloud — "scattered belongings"
    const ch = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      const u = Math.random() * 2 - 1, th = Math.random() * Math.PI * 2;
      const r = 1.2 + Math.pow(Math.random(), 0.7) * 3.4;
      const s = Math.sqrt(1 - u * u);
      ch[i * 3] = Math.cos(th) * s * r * 1.5;
      ch[i * 3 + 1] = u * r * 0.8;
      ch[i * 3 + 2] = Math.sin(th) * s * r - 0.5;
    }
    shapes.chaos = ch;
  }

  // Layout per shape: where the group sits & how big (desktop / mobile)
  const layout = {
    logo:   { d: [1.35, 0.7, 0.78], m: [0, 1.5, 0.4] },
    chaos:  { d: [0, 0, 1],         m: [0, 0, 0.7] },
    euro:   { d: [0, 0.05, 1.05],   m: [0, 0.1, 0.75] },
    galaxy: { d: [0.4, -0.1, 1],    m: [0, 0, 0.75] },
    shield: { d: [1.25, 0, 0.95],   m: [0, 0.6, 0.55] },
    tiky:   { d: [0, 0.2, 1],       m: [0, -1.2, 0.42] },
  };

  // ---------- Shaders ----------
  const vert = `
    attribute vec3 aFrom;
    attribute vec3 aTo;
    attribute vec3 aRand;
    uniform float uProgress;
    uniform float uTime;
    uniform float uSize;
    uniform float uPixelRatio;
    uniform vec3 uMouse;
    uniform vec3 uColorA;
    uniform vec3 uColorB;
    varying vec3 vColor;
    varying float vAlpha;

    void main() {
      float p = clamp(uProgress * 1.6 - aRand.x * 0.6, 0.0, 1.0);
      p = p * p * (3.0 - 2.0 * p);
      vec3 pos = mix(aFrom, aTo, p);

      // swirl outward mid-transition
      float s = sin(p * 3.14159);
      vec3 dir = normalize(aRand - 0.5 + 0.0001);
      pos += dir * s * (0.6 + aRand.y * 0.9);

      // idle breathing
      float t = uTime * 0.6;
      pos += vec3(sin(t + aRand.y * 6.28), cos(t * 0.8 + aRand.z * 6.28), sin(t * 0.7 + aRand.x * 6.28)) * 0.025;

      // mouse repulsion
      vec2 d = pos.xy - uMouse.xy;
      float dist = length(d);
      pos.xy += normalize(d + 0.0001) * smoothstep(0.85, 0.0, dist) * 0.42;
      pos.z += smoothstep(0.85, 0.0, dist) * 0.3;

      vec4 mv = modelViewMatrix * vec4(pos, 1.0);
      gl_Position = projectionMatrix * mv;
      gl_PointSize = uSize * (0.45 + aRand.z * 1.1) * uPixelRatio * (1.0 / -mv.z);

      float k = clamp((pos.x + pos.y * 0.35) / 4.0 + 0.5, 0.0, 1.0);
      vColor = mix(uColorA, uColorB, k);
      vColor = mix(vColor, vec3(1.0), smoothstep(0.92, 1.0, aRand.y) * 0.8);
      vAlpha = 0.45 + aRand.y * 0.55;
    }
  `;
  const frag = `
    uniform float uOpacity;
    varying vec3 vColor;
    varying float vAlpha;
    void main() {
      float d = length(gl_PointCoord - 0.5);
      float a = smoothstep(0.5, 0.0, d);
      a = pow(a, 1.6);
      gl_FragColor = vec4(vColor, a * vAlpha * uOpacity);
    }
  `;

  // ---------- Init ----------
  function init(canvas) {
    if (started) return;
    started = true;
    N = isMobile() ? 6000 : 15000;

    renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.setSize(innerWidth, innerHeight);
    renderer.setClearColor(0x000000, 0);

    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.1, 100);
    camera.position.set(0, 0, 6);

    buildShapes();

    from = new Float32Array(N * 3);
    to = new Float32Array(N * 3);
    rand = new Float32Array(N * 3);
    for (let i = 0; i < N * 3; i++) rand[i] = Math.random();
    // start as a far, faint cloud
    for (let i = 0; i < N; i++) {
      from[i * 3]     = (Math.random() - 0.5) * 14;
      from[i * 3 + 1] = (Math.random() - 0.5) * 9;
      from[i * 3 + 2] = (Math.random() - 0.5) * 8 - 2;
    }
    to.set(from);

    geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(from.slice(), 3));
    geo.setAttribute('aFrom', new THREE.BufferAttribute(from, 3));
    geo.setAttribute('aTo', new THREE.BufferAttribute(to, 3));
    geo.setAttribute('aRand', new THREE.BufferAttribute(rand, 3));

    mat = new THREE.ShaderMaterial({
      vertexShader: vert,
      fragmentShader: frag,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uProgress: { value: 1 },
        uTime: { value: 0 },
        uSize: { value: isMobile() ? 34 : 30 },
        uPixelRatio: { value: renderer.getPixelRatio() },
        uMouse: { value: mouseSmooth },
        uColorA: { value: new THREE.Color('#52F196') },
        uColorB: { value: new THREE.Color('#36B3F5') },
        uOpacity: { value: 1 },
      },
    });

    points = new THREE.Points(geo, mat);
    points.frustumCulled = false;
    group.add(points);
    scene.add(group);

    addEventListener('resize', onResize);
    addEventListener('pointermove', e => {
      mouseNdc.x = (e.clientX / innerWidth) * 2 - 1;
      mouseNdc.y = -(e.clientY / innerHeight) * 2 + 1;
    }, { passive: true });

    const clock = new THREE.Clock();
    const tmp = new THREE.Vector3();
    const tick = () => {
      const t = clock.getElapsedTime();
      mat.uniforms.uTime.value = t;

      // mouse → world (z = 0 plane), then into group space
      tmp.set(mouseNdc.x, mouseNdc.y, 0.5).unproject(camera).sub(camera.position).normalize();
      const dist = -camera.position.z / tmp.z;
      mouseWorld.copy(camera.position).addScaledVector(tmp, dist);
      group.worldToLocal(mouseWorld);
      mouseSmooth.lerp(mouseWorld, 0.12);

      // gentle parallax + sway
      group.rotation.y += ((mouseNdc.x * 0.22 + Math.sin(t * 0.25) * 0.08) - group.rotation.y) * 0.04;
      group.rotation.x += ((-mouseNdc.y * 0.12) - group.rotation.x) * 0.04;
      if (current === 'galaxy' || current === 'chaos') points.rotation.y = t * 0.04;
      else points.rotation.y += (0 - points.rotation.y) * 0.03;

      renderer.render(scene, camera);
      requestAnimationFrame(tick);
    };
    tick();
  }

  function onResize() {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
    applyLayout(current, 0.8);
  }

  function applyLayout(name, duration = 2) {
    const l = layout[name];
    if (!l) return;
    const [x, y, s] = isMobile() ? l.m : l.d;
    gsap.to(group.position, { x, y, duration, ease: 'power3.inOut' });
    gsap.to(group.scale, { x: s, y: s, z: s, duration, ease: 'power3.inOut' });
  }

  // ---------- Morph ----------
  function morph(name, { duration = 2.4 } = {}) {
    if (!started || name === current || !shapes[name]) return;
    // bake current interpolated position into `from`
    const p = progress.v;
    for (let i = 0; i < N; i++) {
      let e = Math.min(Math.max(p * 1.6 - rand[i * 3] * 0.6, 0), 1);
      e = e * e * (3 - 2 * e);
      for (let k = 0; k < 3; k++) {
        const j = i * 3 + k;
        from[j] = from[j] + (to[j] - from[j]) * e;
      }
    }
    to.set(shapes[name]);
    geo.attributes.aFrom.needsUpdate = true;
    geo.attributes.aTo.needsUpdate = true;

    if (morphTween) morphTween.kill();
    progress.v = 0;
    mat.uniforms.uProgress.value = 0;
    morphTween = gsap.to(progress, {
      v: 1, duration, ease: 'power2.inOut',
      onUpdate: () => (mat.uniforms.uProgress.value = progress.v),
    });
    current = name;
    applyLayout(name, duration * 0.9);
  }

  function setOpacity(v, duration = 1.2) {
    if (!started) return;
    gsap.to(mat.uniforms.uOpacity, { value: v, duration, ease: 'power2.out' });
  }

  return { init, morph, setOpacity, get current() { return current; } };
})();
