/**
 * main.js
 * Ponto de Entrada e Loop Principal do Jogo:
 * "Como você ensinaria o robô a arrumar o seu quarto?"
 */

import { TrainingSystem } from './src/systems/TrainingSystem.js';
import { SoundEffects } from './src/audio/SoundEffects.js';
import { BedroomScene } from './src/scenes/BedroomScene.js';
import { Avatar } from './src/entities/Avatar.js';
import { RobotAgent } from './src/entities/RobotAgent.js';
import { HUD } from './src/ui/HUD.js';
import { TOTAL_ITEMS } from './src/data/items.js';

class GameApp {
  constructor() {
    this.canvas = document.getElementById('game-canvas');
    this.clock = new THREE.Clock();

    this.keys = {};
    this.touchDir = new THREE.Vector2();
    this.isTouchActive = false;

    this.hasTriggeredMilestone20 = false;
    this.isSoloModeActive = false;
    this.soloQueue = [];
    this.isProcessingSoloItem = false;
    this.soloErrorsTriggered = 0;

    this.initThree();
    this.initSystems();
    this.bindInputs();
    this.animate();
  }

  initThree() {
    // Cenário Three.js
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xDCE7F5); // Céu suave aconchegante

    // Câmera em perspectiva isométrica/terceira pessoa suave
    const aspect = window.innerWidth / window.innerHeight;
    this.camera = new THREE.PerspectiveCamera(45, aspect, 0.1, 100);
    this.camera.position.set(0, 7.8, 9.2);

    // Renderizador WebGL com sombras suaves
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      powerPreference: 'high-performance'
    });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    // Redimensionamento de tela
    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    });
  }

  initSystems() {
    this.sfx = new SoundEffects();
    this.training = new TrainingSystem();
    this.bedroom = new BedroomScene(this.scene, this.camera);
    this.avatar = new Avatar(this.scene);
    this.robot = new RobotAgent(this.scene);
    this.hud = new HUD(this.training, this.sfx);

    // Callbacks do HUD
    this.hud.onSelectCategory = (itemMesh, categoryId) => {
      this.teachItem(itemMesh, categoryId);
    };

    this.hud.onStartSoloMode = () => {
      this.startSoloAutonomy();
    };

    this.hud.onContinueTeaching = () => {
      this.isSoloModeActive = false;
    };

    this.hud.onCosmeticToggle = (cosmeticName, isEnabled) => {
      this.robot.setCosmetic(cosmeticName, isEnabled);
    };
  }

  bindInputs() {
    // Teclado
    window.addEventListener('keydown', (e) => {
      this.keys[e.key.toLowerCase()] = true;
      this.sfx.resumeIfNeeded();

      if (e.code === 'Space') {
        e.preventDefault();
        this.tryInteractWithHighlighted();
      }
    });

    window.addEventListener('keyup', (e) => {
      this.keys[e.key.toLowerCase()] = false;
    });

    // Clique do Mouse no cenário 3D (Raycasting em objetos no chão)
    this.canvas.addEventListener('pointerdown', (e) => {
      this.sfx.resumeIfNeeded();
      if (this.hud.isTeachModalOpen || this.isSoloModeActive) return;

      const rect = this.canvas.getBoundingClientRect();
      const mouse = new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1
      );

      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(mouse, this.camera);

      // Checar se clicou em algum dos objetos de bagunça
      const meshes = this.bedroom.messyItems.filter(m => !m.userData.isCollected);
      const intersects = raycaster.intersectObjects(meshes, true);

      if (intersects.length > 0) {
        // Encontrar o grupo raiz do item
        let rootGroup = intersects[0].object;
        while (rootGroup.parent && rootGroup.parent !== this.scene && !rootGroup.userData.itemData) {
          rootGroup = rootGroup.parent;
        }

        if (rootGroup && rootGroup.userData.itemData) {
          this.hud.openTeachModal(rootGroup);
        }
      }
    });

    // Controles de Toque (D-Pad para tablets)
    document.querySelectorAll('.dpad-btn').forEach(btn => {
      const dir = btn.dataset.dir;
      const startTouch = () => {
        this.sfx.resumeIfNeeded();
        if (dir === 'up') this.touchDir.y = -1;
        if (dir === 'down') this.touchDir.y = 1;
        if (dir === 'left') this.touchDir.x = -1;
        if (dir === 'right') this.touchDir.x = 1;
      };
      const endTouch = () => {
        this.touchDir.set(0, 0);
      };

      btn.addEventListener('touchstart', startTouch);
      btn.addEventListener('touchend', endTouch);
      btn.addEventListener('mousedown', startTouch);
      btn.addEventListener('mouseup', endTouch);
    });

    // Botão de Ação de Toque
    document.getElementById('btn-touch-action')?.addEventListener('click', () => {
      this.tryInteractWithHighlighted();
    });
  }

  tryInteractWithHighlighted() {
    if (this.hud.isTeachModalOpen || this.isSoloModeActive) return;
    if (this.bedroom.highlightedItem) {
      this.hud.openTeachModal(this.bedroom.highlightedItem);
    }
  }

  teachItem(itemMesh, categoryId) {
    const item = itemMesh.userData.itemData;

    // Registra amostra no dataset
    const result = this.training.addSample(item, categoryId);

    // Efeitos visuais e sonoros
    this.sfx.playPickup();
    this.avatar.setTeaching(true);
    this.robot.setScanning(true);

    // Robô voa até o objeto e transporta
    this.robot.moveTo(itemMesh.position.clone().add(new THREE.Vector3(0, 0.4, 0)), 'CARRY');

    setTimeout(() => {
      this.robot.setScanning(false);
      this.avatar.setTeaching(false);
      this.sfx.playDeposit();
      this.sfx.playSuccess();

      this.bedroom.collectItem(itemMesh, categoryId, () => {
        this.robot.followPlayer();

        // Atualiza interface
        const accuracy = this.training.calculateEstimatedAccuracy();
        this.hud.updateHUD(this.training.totalSamples, TOTAL_ITEMS, accuracy);
        this.hud.showToast(result.insight);

        // Checar Marco dos 20 Itens (Ponto crítico da pedagogia!)
        if (this.training.totalSamples === 20 && !this.hasTriggeredMilestone20) {
          this.hasTriggeredMilestone20 = true;
          setTimeout(() => {
            this.hud.showMilestone20();
          }, 800);
        }

        // Checar Condição de Vitória (Todos os itens guardados)
        this.checkVictoryCondition();
      });
    }, 600);
  }

  startSoloAutonomy() {
    this.isSoloModeActive = true;
    this.hud.setGameMode('SOLO');
    this.processNextSoloItem();
  }

  processNextSoloItem() {
    if (!this.isSoloModeActive) return;

    // Obter itens restantes não coletados
    const remainingItems = this.bedroom.messyItems.filter(m => !m.userData.isCollected);

    if (remainingItems.length === 0) {
      this.checkVictoryCondition();
      return;
    }

    // Pega o item mais próximo do robô
    remainingItems.sort((a, b) => a.position.distanceTo(this.robot.mesh.position) - b.position.distanceTo(this.robot.mesh.position));
    const targetItemMesh = remainingItems[0];
    const item = targetItemMesh.userData.itemData;

    // Inferência da IA
    const prediction = this.training.predict(item);
    let predictedCat = prediction.predictedCategory;

    // Simulação do Erro Cômico de Validação dos 20 Itens:
    // Se estiver com ~20 amostras e ainda não cometeu erro pedagógico, induz um erro engraçado
    // em um item peculiar (ex: bolinha de pingue-pongue branca confundida com meia pela cor branca)
    const isEdgeCase = (item.id === 'bola_ping_pong' || item.id === 'guardanapo_gorduroso' || item.id === 'pantufa_monstrinho');
    const shouldSimulateError = (this.soloErrorsTriggered === 0 && isEdgeCase);

    this.robot.moveTo(targetItemMesh.position.clone().add(new THREE.Vector3(0, 0.4, 0)), 'SOLO');
    this.robot.setScanning(true);

    setTimeout(() => {
      this.robot.setScanning(false);

      if (shouldSimulateError) {
        this.soloErrorsTriggered++;
        this.robot.setMood('error');

        // Prediz categoria errada cômica
        const wrongCat = (item.id === 'bola_ping_pong') ? 1 : (item.id === 'guardanapo_gorduroso') ? 4 : 3;

        this.hud.showRobotError(item, wrongCat, item.category, () => {
          // Jogador corrigiu o robô! Aprendizado por Reforço!
          this.training.addSample(item, item.category);
          this.sfx.playDeposit();
          this.bedroom.collectItem(targetItemMesh, item.category, () => {
            this.hud.updateHUD(this.training.totalSamples, TOTAL_ITEMS, this.training.calculateEstimatedAccuracy());
            setTimeout(() => this.processNextSoloItem(), 800);
          });
        });
      } else {
        // Robô acerta o destino!
        this.sfx.playDeposit();
        this.sfx.playSuccess();
        this.training.addSample(item, item.category);

        this.bedroom.collectItem(targetItemMesh, item.category, () => {
          this.hud.updateHUD(this.training.totalSamples, TOTAL_ITEMS, this.training.calculateEstimatedAccuracy());
          setTimeout(() => this.processNextSoloItem(), 800);
        });
      }
    }, 900);
  }

  checkVictoryCondition() {
    const remaining = this.bedroom.messyItems.filter(m => !m.userData.isCollected);
    if (remaining.length === 0) {
      this.avatar.setDancing(true);
      this.robot.state = 'CELEBRATE';

      const finalAccuracy = this.training.calculateEstimatedAccuracy();
      setTimeout(() => {
        this.hud.showVictory({
          totalSamples: this.training.totalSamples,
          finalAccuracy,
          itemsCleaned: TOTAL_ITEMS
        });
      }, 1200);
    }
  }

  animate() {
    requestAnimationFrame(() => this.animate());

    const delta = Math.min(this.clock.getDelta(), 0.1);

    // Calcular vetor de movimentação do jogador
    const inputDir = new THREE.Vector3();
    if (this.keys['w'] || this.keys['arrowup']) inputDir.z -= 1;
    if (this.keys['s'] || this.keys['arrowdown']) inputDir.z += 1;
    if (this.keys['a'] || this.keys['arrowleft']) inputDir.x -= 1;
    if (this.keys['d'] || this.keys['arrowright']) inputDir.x += 1;

    // Mesclar com controles de toque (D-pad)
    if (this.touchDir.lengthSq() > 0) {
      inputDir.x += this.touchDir.x;
      inputDir.z += this.touchDir.y;
    }

    // Não mover o avatar durante modais ou modo solo
    if (this.hud.isTeachModalOpen || this.isSoloModeActive) {
      inputDir.set(0, 0, 0);
    }

    // Atualizar entidades
    this.avatar.update(delta, inputDir);
    this.robot.update(delta, this.avatar.mesh.position);
    this.bedroom.update(delta, this.avatar.mesh.position);

    // Atualizar prompt de interação
    if (this.bedroom.highlightedItem && !this.hud.isTeachModalOpen && !this.isSoloModeActive) {
      this.hud.showInteractionPrompt(this.bedroom.highlightedItem.userData.itemData.name);
    } else {
      this.hud.hideInteractionPrompt();
    }

    // Câmera segue o jogador suavemente (Third-person lerp)
    const targetCamPos = this.avatar.mesh.position.clone().add(new THREE.Vector3(0, 6.2, 7.2));
    this.camera.position.lerp(targetCamPos, delta * 3.5);
    this.camera.lookAt(this.avatar.mesh.position.clone().add(new THREE.Vector3(0, 0.8, 0)));

    this.renderer.render(this.scene, this.camera);
  }
}

// Iniciar a aplicação quando a janela carregar
window.addEventListener('DOMContentLoaded', () => {
  new GameApp();
});
