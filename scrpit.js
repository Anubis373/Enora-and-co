let state = {
            score: 0,
            perSecond: 0,
            totalClicks: 0
        };

        // Définition des améliorations basées sur le PDF
        const upgrades = [
            {
                id: 'usb',
                name: "Clé USB Bootable",
                desc: "Permet d'installer Linux plus vite.",
                baseCost: 15,
                production: 0.5, // 1 PC tous les 2 secondes
                count: 0,
                icon: "💾"
            },
            {
                id: 'club',
                name: "Club Informatique",
                desc: "Des élèves passionnés aident à la maintenance.", // 
                baseCost: 100,
                production: 3,
                count: 0,
                icon: "students" // ou emoji 🙋
            },
            {
                id: 'teacher',
                name: "Formation Profs",
                desc: "Les enseignants adoptent le Libre.", // 
                baseCost: 500,
                production: 10,
                count: 0,
                icon: "👨‍🏫"
            },
            {
                id: 'tech',
                name: "Admin Réseau Allié",
                desc: "L'admin réseau déploie des images NIRD.", // 
                baseCost: 2000,
                production: 50,
                count: 0,
                icon: "⚙️"
            },
            {
                id: 'forge',
                name: "Forge des Communs",
                desc: "Mutualisation nationale des ressources.", // [cite: 46]
                baseCost: 10000,
                production: 200,
                count: 0,
                icon: "🔥"
            }
        ];

        // Éléments du DOM
        const scoreEl = document.getElementById('score');
        const perSecEl = document.getElementById('per-second');
        const co2El = document.getElementById('co2-saved');
        const upgradesContainer = document.getElementById('upgrades-list');
        const btn = document.getElementById('main-btn');

        // Fonction du clic principal
        function clickAction() {
            addScore(1);
            // Petit effet visuel
            btn.style.transform = "scale(0.95)";
            setTimeout(() => btn.style.transform = "scale(1)", 50);
        }

        // Ajouter du score
        function addScore(amount) {
            state.score += amount;
            state.totalClicks += amount;
            updateUI();
        }

        // Acheter une amélioration
        function buyUpgrade(index) {
            const upg = upgrades[index];
            if (state.score >= upg.cost) {
                state.score -= upg.cost;
                upg.count++;
                // Augmentation du coût (x1.15 à chaque achat)
                upg.cost = Math.ceil(upg.baseCost * Math.pow(1.15, upg.count));
                recalcProduction();
                renderUpgrades(); // Re-render pour mettre à jour les prix/boutons
                updateUI();
            }
        }

        // Recalculer la production par seconde
        function recalcProduction() {
            let totalProd = 0;
            upgrades.forEach(u => {
                totalProd += (u.production * u.count);
            });
            state.perSecond = parseFloat(totalProd.toFixed(1));
        }

        // Boucle de jeu (1 fois par seconde)
        setInterval(() => {
            if (state.perSecond > 0) {
                addScore(state.perSecond);
            }
        }, 1000);

        // Mise à jour de l'affichage simple
        function updateUI() {
            scoreEl.innerText = Math.floor(state.score);
            perSecEl.innerText = state.perSecond;
            // Estimation fictive : 1 PC = ~200kg CO2 à la fabrication évité
            co2El.innerText = (state.totalClicks * 200).toLocaleString(); 

            // Vérifier si les boutons d'achat sont dispos
            upgrades.forEach((u, index) => {
                const el = document.getElementById(`upg-${index}`);
                if (el) {
                    if (state.score >= u.cost) {
                        el.classList.remove('locked');
                    } else {
                        el.classList.add('locked');
                    }
                }
            });
        }

        // Génération de la liste des upgrades (HTML)
        function renderUpgrades() {
            upgradesContainer.innerHTML = "";
            upgrades.forEach((u, index) => {
                // Calcul du coût actuel si pas encore fait (init)
                if (!u.cost) u.cost = u.baseCost;

                const isLocked = state.score < u.cost ? 'locked' : '';
                
                const html = `
                <div id="upg-${index}" class="upgrade-item ${isLocked}" onclick="buyUpgrade(${index})">
                    <div style="display:flex; align-items:center;">
                        <div style="font-size: 2rem; margin-right: 1rem;">${u.icon || '📦'}</div>
                        <div class="upgrade-info">
                            <h4>${u.name} <span class="level-badge">Niv. ${u.count}</span></h4>
                            <p>${u.desc}</p>
                            <p style="font-size:0.8rem; color:var(--primary);">+${u.production} PC/sec</p>
                        </div>
                    </div>
                    <div class="upgrade-cost">
                        ${u.cost} PC
                    </div>
                </div>
                `;
                upgradesContainer.innerHTML += html;
            });
        }

        // Initialisation
        renderUpgrades();
        updateUI();
