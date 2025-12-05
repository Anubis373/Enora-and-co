// --- LOGIQUE DU JEU CLICKER ---

let state = {
    score: 0,
    perSecond: 0,
    totalClicks: 0,
    isSnakeUnlocked: false // État pour le jeu Snake
};

// Définition des améliorations et leurs coûts/production
const upgrades = [
    {
        id: 'usb',
        name: "Clé USB Bootable",
        desc: "Permet d'installer Linux plus vite.",
        baseCost: 15,
        production: 0.5, 
        count: 0,
        icon: "💾"
    },
    {
        id: 'club',
        name: "Club Informatique",
        desc: "Des élèves passionnés aident à la maintenance (Acteurs: Élèves, Clubs info).",
        baseCost: 100,
        production: 3,
        count: 0,
        icon: "🙋"
    },
    {
        id: 'teacher',
        name: "Formation Profs",
        desc: "Les enseignants adoptent le Libre (Acteur: Enseignants).",
        baseCost: 500,
        production: 10,
        count: 0,
        icon: "👨‍🏫"
    },
    // NOUVELLE AMÉLIORATION POUR DÉBLOQUER LE SNAKE
    {
        id: 'matrix_access',
        name: "Accès au Noyau Système",
        desc: "Déverrouille le jeu d'entraînement 'The Snake Matrix'.",
        baseCost: 20,
        production: 0, 
        count: 0,
        icon: "🗝️"
    },
    // FIN NOUVELLE AMÉLIORATION
    {
        id: 'tech',
        name: "Admin Réseau Allié",
        desc: "L'admin réseau déploie des images NIRD (Acteur: Techniciens/Admin Réseau).",
        baseCost: 2000,
        production: 50,
        count: 0,
        icon: "⚙️"
    },
    {
        id: 'forge',
        name: "Forge des Communs",
        desc: "Mutualisation nationale des ressources et outils libres (Acteur: La Forge).", 
        baseCost: 10000,
        production: 200,
        count: 0,
        icon: "🔥"
    }
];

// Éléments du DOM (à récupérer dans index.html)
const scoreEl = document.getElementById('score');
const perSecEl = document.getElementById('per-second');
const co2El = document.getElementById('co2-saved');
const upgradesContainer = document.getElementById('upgrades-list');
const btn = document.getElementById('main-btn');


// Fonction principale du clic (Accessible globalement via l'attribut onclick dans index.html)
function clickAction() {
    addScore(1);
    // Petit effet visuel
    btn.style.transform = "scale(0.95)";
    setTimeout(() => btn.style.transform = "scale(1)", 50);
}

// Ajouter du score
function addScore(amount) {
    state.score += amount;
    // La production automatique ne compte pas comme un "clic" mais comme un "sauvetage"
    if (amount > 0) { 
        state.totalClicks += amount;
    }
    updateUI();
}

// Acheter une amélioration
function buyUpgrade(index) {
    const upg = upgrades[index];

    // Si le Snake est déjà débloqué, on redirige vers le jeu
    if (upg.id === 'matrix_access' && state.isSnakeUnlocked) {
        unlockSnakeGame();
        return; 
    }

    if (state.score >= upg.cost) {
        state.score -= upg.cost;
        upg.count++;
        // Augmentation du coût (x1.15 à chaque achat)
        upg.cost = Math.ceil(upg.baseCost * Math.pow(1.15, upg.count));
        
        // LOGIQUE SPÉCIFIQUE POUR DÉBLOQUER LE SNAKE
        if (upg.id === 'matrix_access') {
            state.isSnakeUnlocked = true;
            upg.production = 25; // Production automatique après l'unlock
            // On le rend extrêmement cher pour qu'il ne puisse plus être racheté
            upg.baseCost = Infinity; 
            upg.desc = "Accès au Noyau débloqué. Entraînement terminé : +25 PC/sec. (Cliquez pour Jouer !)";
            
            // Redirection vers la nouvelle page du jeu
            unlockSnakeGame();
        }
        // FIN LOGIQUE SNAKE

        recalcProduction();
        renderUpgrades(); // Re-render pour mettre à jour les prix/boutons
        updateUI();
    }
}

// FONCTION DE REDIRECTION VERS LE JEU SNAKE
function unlockSnakeGame() {
    // Redirige l'utilisateur vers la nouvelle page
    window.location.href = "snake_matrix.html"; 
}


// Recalculer la production par seconde
function recalcProduction() {
    let totalProd = 0;
    upgrades.forEach(u => {
        totalProd += (u.production * u.count);
    });
    // On garde une décimale pour la lisibilité
    state.perSecond = parseFloat(totalProd.toFixed(1)); 
}

// Boucle de jeu (1 fois par seconde pour la production automatique)
setInterval(() => {
    if (state.perSecond > 0) {
        // Ajoute le score automatique, mais ne compte pas comme un clic
        state.score += state.perSecond; 
        updateUI();
    }
}, 1000);

// Mise à jour de l'affichage
function updateUI() {
    scoreEl.innerText = Math.floor(state.score).toLocaleString('fr-FR');
    perSecEl.innerText = state.perSecond;
    // Estimation fictive : 1 PC = ~200kg CO2 à la fabrication évité
    co2El.innerText = (Math.floor(state.totalClicks) * 200).toLocaleString('fr-FR'); 

    // Vérifier si les boutons d'achat sont dispos
    upgrades.forEach((u, index) => {
        const el = document.getElementById(`upg-${index}`);
        if (el) {
            // Logique de lock/unlock
            if (state.score >= u.cost && !el.classList.contains('play-button')) {
                el.classList.remove('locked');
            } else if (!el.classList.contains('play-button')) {
                el.classList.add('locked');
            }
        }
    });
}

// Génération de la liste des upgrades (HTML)
function renderUpgrades() {
    upgradesContainer.innerHTML = "";
    upgrades.forEach((u, index) => {
        if (!u.cost) u.cost = u.baseCost;

        let extraClass = '';
        let buttonContent = `${u.cost.toLocaleString('fr-FR')} PC`;
        
        // Logique spécifique pour l'amélioration Snake
        if (u.id === 'matrix_access' && state.isSnakeUnlocked) {
            extraClass = 'play-button';
            buttonContent = 'Jouer à la Matrice !';
        } else if (u.id === 'matrix_access' && state.score < u.cost) {
            extraClass = 'locked';
        } else if (state.score < u.cost) {
            extraClass = 'locked';
        }


        const html = `
        <div id="upg-${index}" class="upgrade-item ${extraClass}" onclick="buyUpgrade(${index})">
            <div style="display:flex; align-items:center;">
                <div style="font-size: 2rem; margin-right: 1rem;">${u.icon || '📦'}</div>
                <div class="upgrade-info">
                    <h4>${u.name} <span class="level-badge">Niv. ${u.count}</span></h4>
                    <p>${u.desc}</p>
                    ${u.count > 0 && u.id !== 'matrix_access' ? `<p style="font-size:0.8rem; color:var(--primary);">+${u.production} PC/sec</p>` : (u.id === 'matrix_access' && u.count > 0 ? `<p style="font-size:0.8rem; color:var(--primary);">+${u.production} PC/sec</p>` : '')}
                </div>
            </div>
            <div class="upgrade-cost">
                ${buttonContent}
            </div>
        </div>
        `;
        upgradesContainer.innerHTML += html;
    });
}

// Initialisation au chargement de la page
renderUpgrades();
recalcProduction(); 
updateUI();