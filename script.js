/**
 * BRIDGED LOOP - GOOGLE GRAVITY 2D PHYSICS ENGINE (Matter.js)
 * 
 * Convierte los bloques modulares del DOM en cuerpos rígidos interactivos con física 2D.
 * Permite arrastrar, lanzar, colisiones elásticas, límites de ventana responsivos
 * y preservación de interacción con enlaces e inputs.
 */

(function (window, document) {
    'use strict';

    // Configuración del Motor
    const CONFIG = {
        gravity: { x: 0, y: 1.2, scale: 0.001 },
        restitution: 0.65,    // Coeficiente de rebote elástico
        friction: 0.12,       // Fricción entre cuerpos
        frictionAir: 0.002,   // Resistencia al aire
        density: 0.002,
        wallThickness: 120,
        elementsSelector: [
            '.site-header',
            '.hero-badge',
            '.hero-title',
            '.hero-description',
            '.hero-actions',
            '.hero-media-box',
            '.section-heading',
            '.service-card',
            '.feature-box',
            '.contact-card',
            '.contact-info-card',
            '.site-footer',
            '.gravity-body',
            '.physics-item'
        ].join(', ')
    };

    class BridgedLoopGravity {
        constructor() {
            this.engine = null;
            this.runner = null;
            this.mouseConstraint = null;
            this.bodies = [];
            this.walls = [];
            this.isActive = false;
            this.isDragging = false;
            this.dragStartPos = { x: 0, y: 0 };
            this.originalPositions = new Map();

            this.init();
        }

        async init() {
            // Verificar o inyectar Matter.js si no está presente
            await this.ensureMatterLoaded();

            // Configurar Listeners de UI
            this.setupUIListeners();
        }

        ensureMatterLoaded() {
            return new Promise((resolve, reject) => {
                if (window.Matter) {
                    resolve(window.Matter);
                    return;
                }

                const script = document.createElement('script');
                script.src = 'https://cdnjs.cloudflare.com/ajax/libs/matter-js/0.19.0/matter.min.js';
                script.onload = () => resolve(window.Matter);
                script.onerror = () => {
                    console.error('Error al cargar Matter.js desde CDN');
                    reject(new Error('Matter.js CDN unreachable'));
                };
                document.head.appendChild(script);
            });
        }

        setupUIListeners() {
            // Botones de toggle de gravedad
            document.querySelectorAll('.gravity-toggle-btn, #gravity-toggle, [data-gravity-trigger]').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.preventDefault();
                    this.toggleGravity();
                });
            });

            // Botón de reset
            document.querySelectorAll('.reset-gravity-btn, #reset-gravity').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.preventDefault();
                    this.resetLayout();
                });
            });

            // Listener de resize
            window.addEventListener('resize', () => {
                if (this.isActive) {
                    this.updateBoundaries();
                }
            });
        }

        toggleGravity() {
            if (this.isActive) {
                this.resetLayout();
            } else {
                this.startGravity();
            }
        }

        startGravity() {
            if (this.isActive || !window.Matter) return;

            const { Engine, Runner, Bodies, Composite, Mouse, MouseConstraint, Events, Body } = window.Matter;

            // 1. Crear Motor de Física
            this.engine = Engine.create({
                gravity: CONFIG.gravity
            });

            this.runner = Runner.create();

            // 2. Preparar el Body y Canvas para interacción
            document.body.classList.add('gravity-active');
            this.updateStatusBar(true);

            // 3. Crear Muros Límites (Suelo, Pared Izquierda, Derecha, Techo)
            this.createBoundaries();

            // 4. Seleccionar y convertir elementos modulares del DOM
            const rawElements = Array.from(document.querySelectorAll(CONFIG.elementsSelector));
            // Filtrar elementos visibles e independientes (evitar ancestro y descendiente simultáneos)
            const targetElements = this.filterLeafBodies(rawElements);

            this.bodies = [];

            targetElements.forEach((el, index) => {
                const rect = el.getBoundingClientRect();

                // Ignorar elementos ocultos o sin tamaño
                if (rect.width === 0 || rect.height === 0) return;

                // Guardar dimensiones y estilos previos
                this.originalPositions.set(el, {
                    style: el.getAttribute('style') || '',
                    className: el.className
                });

                // Anclar dimensiones fijas antes de volverlo fixed
                el.style.width = `${rect.width}px`;
                el.style.height = `${rect.height}px`;
                el.classList.add('physics-active');

                // Centro de masa inicial
                const centerX = rect.left + rect.width / 2;
                const centerY = rect.top + rect.height / 2;

                // Crear Rigid Body en Matter.js
                const body = Bodies.rectangle(centerX, centerY, rect.width, rect.height, {
                    restitution: CONFIG.restitution,
                    friction: CONFIG.friction,
                    frictionAir: CONFIG.frictionAir,
                    density: CONFIG.density,
                    chamfer: { radius: 6 }
                });

                // Leve impulso angular y lateral para efecto orgánico
                const randomAngularVel = (Math.random() - 0.5) * 0.05;
                const randomVelocityX = (Math.random() - 0.5) * 2;
                Body.setAngularVelocity(body, randomAngularVel);
                Body.setVelocity(body, { x: randomVelocityX, y: Math.random() * 1 });

                body.domElement = el;
                body.elementWidth = rect.width;
                body.elementHeight = rect.height;
                el._matterBody = body;

                this.bodies.push(body);
            });

            // Añadir cuerpos al mundo de física
            Composite.add(this.engine.world, this.bodies);

            // 5. Configurar MouseConstraint para arrastrar y lanzar cuerpos
            this.setupMouseInteraction();

            // 6. Loop de sincronización (Matter -> DOM)
            Events.on(this.engine, 'afterUpdate', () => {
                for (let i = 0; i < this.bodies.length; i++) {
                    const body = this.bodies[i];
                    const el = body.domElement;
                    if (!el) continue;

                    const x = body.position.x - body.elementWidth / 2;
                    const y = body.position.y - body.elementHeight / 2;
                    const angle = body.angle;

                    el.style.transform = `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, 0px) rotate(${angle.toFixed(4)}rad)`;
                }
            });

            // 7. Iniciar simulación
            Runner.run(this.runner, this.engine);
            this.isActive = true;

            // Actualizar botones UI
            document.querySelectorAll('.gravity-toggle-btn').forEach(btn => {
                btn.classList.add('active');
                btn.innerHTML = '<span class="btn-icon">⚡</span> Restaurar Orden';
            });
        }

        setupMouseInteraction() {
            const { Mouse, MouseConstraint, Composite, Events } = window.Matter;

            // Crear elemento mouse vinculado al documento
            const mouse = Mouse.create(document.body);
            this.mouseConstraint = MouseConstraint.create(this.engine, {
                mouse: mouse,
                constraint: {
                    stiffness: 0.2,
                    render: { visible: false }
                }
            });

            Composite.add(this.engine.world, this.mouseConstraint);

            // Gestión inteligente de clicks para no romper inputs o botones
            let dragMoved = false;

            Events.on(this.mouseConstraint, 'startdrag', (evt) => {
                this.isDragging = true;
                dragMoved = false;
                this.dragStartPos = { ...evt.mouse.position };
            });

            Events.on(this.mouseConstraint, 'mousemove', (evt) => {
                if (this.isDragging) {
                    const dist = Math.hypot(
                        evt.mouse.position.x - this.dragStartPos.x,
                        evt.mouse.position.y - this.dragStartPos.y
                    );
                    if (dist > 6) {
                        dragMoved = true;
                    }
                }
            });

            Events.on(this.mouseConstraint, 'enddrag', (evt) => {
                const body = evt.body;
                this.isDragging = false;

                // Si fue un click rápido sin desplazamiento, activar el elemento subyacente
                if (!dragMoved && body && body.domElement) {
                    const el = body.domElement;
                    if (el.tagName === 'A' || el.tagName === 'BUTTON' || el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
                        el.focus();
                    }
                }
            });
        }

        createBoundaries() {
            const { Bodies, Composite } = window.Matter;
            const w = window.innerWidth;
            const h = window.innerHeight;
            const t = CONFIG.wallThickness;

            // Suelo, Paredes laterales y Techo
            this.ground = Bodies.rectangle(w / 2, h + t / 2, w * 3, t, { isStatic: true, friction: 0.5, label: 'Ground' });
            this.leftWall = Bodies.rectangle(-t / 2, h / 2, t, h * 3, { isStatic: true, friction: 0.5, label: 'LeftWall' });
            this.rightWall = Bodies.rectangle(w + t / 2, h / 2, t, h * 3, { isStatic: true, friction: 0.5, label: 'RightWall' });
            this.ceiling = Bodies.rectangle(w / 2, -t / 2, w * 3, t, { isStatic: true, friction: 0.5, label: 'Ceiling' });

            this.walls = [this.ground, this.leftWall, this.rightWall, this.ceiling];
            Composite.add(this.engine.world, this.walls);
        }

        updateBoundaries() {
            if (!this.engine) return;
            const { Body } = window.Matter;
            const w = window.innerWidth;
            const h = window.innerHeight;
            const t = CONFIG.wallThickness;

            if (this.ground) Body.setPosition(this.ground, { x: w / 2, y: h + t / 2 });
            if (this.leftWall) Body.setPosition(this.leftWall, { x: -t / 2, y: h / 2 });
            if (this.rightWall) Body.setPosition(this.rightWall, { x: w + t / 2, y: h / 2 });
            if (this.ceiling) Body.setPosition(this.ceiling, { x: w / 2, y: -t / 2 });
        }

        filterLeafBodies(elements) {
            // Filtrar para que solo los bloques principales o elementos explícitos sean cuerpos físicos
            const valid = [];
            for (let i = 0; i < elements.length; i++) {
                const el = elements[i];
                let isChildOfAnother = false;

                for (let j = 0; j < elements.length; j++) {
                    if (i !== j && elements[j].contains(el)) {
                        isChildOfAnother = true;
                        break;
                    }
                }

                if (!isChildOfAnother) {
                    valid.push(el);
                }
            }
            return valid;
        }

        resetLayout() {
            if (!this.isActive) return;

            const { Runner, Engine, Composite } = window.Matter;

            // Detener el runner y limpiar el motor
            Runner.stop(this.runner);
            Composite.clear(this.engine.world, false);
            Engine.clear(this.engine);

            // Restaurar estilos de elementos DOM
            this.bodies.forEach(body => {
                const el = body.domElement;
                if (!el) return;

                const orig = this.originalPositions.get(el);
                if (orig) {
                    el.style.cssText = orig.style;
                    el.className = orig.className;
                }
                el.style.transform = '';
                el.style.width = '';
                el.style.height = '';
                delete el._matterBody;
            });

            this.bodies = [];
            this.walls = [];
            this.originalPositions.clear();

            document.body.classList.remove('gravity-active');
            this.updateStatusBar(false);
            this.isActive = false;

            // Actualizar botones UI
            document.querySelectorAll('.gravity-toggle-btn').forEach(btn => {
                btn.classList.remove('active');
                btn.innerHTML = '<span class="btn-icon">⚡</span> Activar Gravedad';
            });
        }

        updateStatusBar(active) {
            let statusBar = document.getElementById('gravity-status-bar');
            if (!statusBar) {
                statusBar = document.createElement('div');
                statusBar.id = 'gravity-status-bar';
                statusBar.className = 'gravity-status-bar';
                statusBar.innerHTML = `
                    <div class="gravity-status-text">
                        <span class="pulse-dot"></span>
                        <span>Física Cuántica Activa &bull; ¡Arrastra y lanza los módulos con el cursor!</span>
                    </div>
                    <button class="reset-gravity-btn" id="reset-gravity-bar-btn">Reordenar Sitio</button>
                `;
                document.body.appendChild(statusBar);

                statusBar.querySelector('#reset-gravity-bar-btn').addEventListener('click', () => {
                    this.resetLayout();
                });
            }

            if (active) {
                statusBar.classList.add('visible');
            } else {
                statusBar.classList.remove('visible');
            }
        }
    }

    // Inicializar cuando el DOM esté listo
    document.addEventListener('DOMContentLoaded', () => {
        window.BridgedGravity = new BridgedLoopGravity();

        // Si la URL contiene el hash #gravity, activar automáticamente
        if (window.location.hash === '#gravity') {
            setTimeout(() => {
                window.BridgedGravity.startGravity();
            }, 800);
        }
    });

})(window, document);
