const questionnaireForm = document.getElementById("questionnaireForm");
const successAnimation = document.getElementById("successAnimation");
// NOUVEAU: Référence au canvas
const confettiCanvas = document.getElementById('confettiCanvas');
const ctx = confettiCanvas.getContext('2d');
let particles = [];
let animationLoopId = null;

// Fonction pour redimensionner le canvas à la taille du parent (.container)
function resizeCanvas() {
    // On s'assure que le canvas prend la taille réelle de son conteneur principal
    const mainContainer = document.querySelector('.container');
    confettiCanvas.width = mainContainer.offsetWidth;
    confettiCanvas.height = mainContainer.offsetHeight;
}
resizeCanvas();
window.addEventListener('resize', resizeCanvas);


// Classe pour définir une particule de confettis
class ConfettiParticle {
    constructor(x, y, color) {
        this.x = x;
        this.y = y;
        this.size = Math.random() * 8 + 3;
        this.color = color;
        this.velocity = {
            x: (Math.random() - 0.5) * 10, // Vitesse horizontale aléatoire
            y: Math.random() * -15 - 5 // Vitesse verticale vers le haut
        };
        this.gravity = 0.5;
        this.drag = 0.98;
        this.terminalVelocity = 6;
        this.spin = Math.random() < 0.5 ? -1 : 1;
        this.angle = 0;
    }

    update() {
        // Application de la traînée (drag) et de la gravité
        this.velocity.x *= this.drag;
        this.velocity.y += this.gravity;
        if (this.velocity.y > this.terminalVelocity) {
            this.velocity.y = this.terminalVelocity;
        }

        this.x += this.velocity.x;
        this.y += this.velocity.y;
        this.angle += this.spin * 0.1;
    }

    draw() {
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.angle);
        ctx.fillStyle = this.color;
        ctx.fillRect(-this.size / 2, -this.size / 2, this.size, this.size);
        ctx.restore();
    }
}

// Couleurs de confettis
function randomColor() {
    const colors = ['#f44336', '#e91e63', '#9c27b0', '#673ab7', '#3f51b5', '#2196f3', '#03a9f4', '#00bcd4', '#009688', '#4caf50', '#8bc34a', '#ffeb3b', '#ffc107', '#ff9800', '#ff5722', '#795548'];
    return colors[Math.floor(Math.random() * colors.length)];
}

// Crée les particules d'une explosion
function createConfetti(count, x, y) {
    for (let i = 0; i < count; i++) {
        particles.push(new ConfettiParticle(x, y, randomColor()));
    }
}

// Boucle d'animation principale
function updateAndDraw() {
    // Efface le contenu précédent avec une légère opacité pour un effet de traînée
    ctx.clearRect(0, 0, confettiCanvas.width, confettiCanvas.height);

    for (let i = particles.length - 1; i >= 0; i--) {
        particles[i].update();
        particles[i].draw();

        // Supprime les particules qui sortent de l'écran (en bas)
        if (particles[i].y > confettiCanvas.height) {
            particles.splice(i, 1);
        }
    }

    if (particles.length > 0) {
        animationLoopId = requestAnimationFrame(updateAndDraw);
    } else {
        // Arrête la boucle quand il n'y a plus de particules
        animationLoopId = null;
    }
}

// Démarre l'animation (explosion)
function startConfettiExplosion() {
    // Point central de la zone où l'explosion doit se produire
    const x = confettiCanvas.width / 2;
    const y = confettiCanvas.height / 2;
    
    // Première explosion
    createConfetti(100, x, y);
    
    // Lance la boucle d'animation si elle n'est pas déjà en cours
    if (!animationLoopId) {
        updateAndDraw();
    }
    
    // Petite explosion retardée pour plus d'effet
    setTimeout(() => {
        createConfetti(50, x, y);
    }, 500);
}


// Logique de soumission du formulaire
questionnaireForm.addEventListener("submit", function(e) {
  e.preventDefault();

  let allFilled = true;
  questionnaireForm.querySelectorAll("input").forEach(input => {
    // Vérifie aussi les champs de type 'number'
    if (!input.value.trim() && input.type !== 'number') allFilled = false;
    if (input.type === 'number' && input.value === '') allFilled = false;
  });

  if (!allFilled) {
    alert("Merci de remplir tous les champs !");
    return;
  }

  questionnaireForm.style.display = "none";
  successAnimation.style.display = "block";
  
  // NOUVEAU: Déclenchement de l'animation des confettis
  startConfettiExplosion();
});