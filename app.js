const SUPABASE_URL = 'https://jllbzmgacvnxttnnkxiw.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_oNZesi5T8tLdQiRm3G0W5w_F0nWBbW3';

let supabaseClient;
if (SUPABASE_URL !== 'SUA_SUPABASE_URL_AQUI') {
    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

// ==========================================
// ESTADO DA APLICAÇÃO
// ==========================================
let shoppingList = JSON.parse(localStorage.getItem('shoppingList')) || [];
let currentResults = [];

// ==========================================
// ELEMENTOS DO DOM
// ==========================================
const searchInput = document.getElementById('searchInput');
const marketSelect = document.getElementById('marketSelect');
const searchBtn = document.getElementById('searchBtn');
const searchResultsSection = document.getElementById('searchResultsSection');
const closeSearchBtn = document.getElementById('closeSearchBtn');
const resultsContainer = document.getElementById('resultsContainer');
const shoppingListContainer = document.getElementById('shoppingListContainer');
const cheapestMarketContainer = document.getElementById('cheapestMarketContainer');
const clearListBtn = document.getElementById('clearListBtn');
const manualListInput = document.getElementById('manualListInput');
const addManualBtn = document.getElementById('addManualBtn');

// ==========================================
// EVENT LISTENERS
// ==========================================
searchBtn.addEventListener('click', handleSearch);
searchInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') handleSearch();
});
clearListBtn.addEventListener('click', clearList);

closeSearchBtn.addEventListener('click', () => {
    searchResultsSection.style.display = 'none';
    searchInput.value = '';
});

addManualBtn.addEventListener('click', handleManualAdd);
manualListInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') handleManualAdd();
});

// Inicializa a lista de compras na tela
renderShoppingList();

// ==========================================
// FUNÇÕES PRINCIPAIS
// ==========================================

function handleManualAdd() {
    const itemName = manualListInput.value.trim();
    if (itemName) {
        addToList(null, itemName);
        manualListInput.value = '';
    }
}

async function handleSearch() {
    const query = searchInput.value.trim();
    const market = marketSelect.value;

    if (!query) {
        resultsContainer.innerHTML = '<p class="empty-state">Digite algo para pesquisar.</p>';
        searchResultsSection.style.display = 'block';
        return;
    }

    searchResultsSection.style.display = 'block';
    resultsContainer.innerHTML = '<p class="empty-state"><i class="ph ph-spinner ph-spin"></i> Buscando...</p>';

    try {
        let queryBuilder;
        
        // Se o supabase não foi configurado, usamos dados mockados para demonstração
        if (!supabaseClient) {
            queryBuilder = mockSearch(query, market);
        } else {
            let req = supabaseClient
                .from('produtos')
                .select('*')
                .ilike('produto', `%${query}%`);
            
            if (market) {
                req = req.eq('supermercado', market);
            }
            // Ordenar por preço (do menor para o maior)
            queryBuilder = await req.order('preco', { ascending: true }).limit(20);
        }

        const { data, error } = queryBuilder;

        if (error) throw error;

        currentResults = data;
        renderResults(currentResults);

    } catch (error) {
        console.error("Erro na busca:", error);
        resultsContainer.innerHTML = '<p class="empty-state" style="color: var(--danger-color);">Erro ao buscar produtos. Tente novamente.</p>';
    }
}

function renderResults(products) {
    if (!products || products.length === 0) {
        resultsContainer.innerHTML = '<p class="empty-state">Nenhum produto encontrado.</p>';
        return;
    }

    resultsContainer.innerHTML = '';
    products.forEach(product => {
        const div = document.createElement('div');
        div.className = 'product-card fade-in';
        div.innerHTML = `
            <div class="product-info">
                <span class="product-name">${product.produto}</span>
                <span class="product-market"><i class="ph ph-storefront"></i> ${formatMarketName(product.supermercado)}</span>
                <span class="market-badge">${product.unidade_medida || 'un'}</span>
            </div>
            <div style="text-align: right;">
                <div class="product-price">R$ ${product.preco.toFixed(2)}</div>
                <button class="add-btn" onclick="addToList('${product.id}', '${product.produto.replace(/'/g, "\\'")}')" title="Adicionar à lista">
                    <i class="ph ph-plus-circle"></i>
                </button>
            </div>
        `;
        resultsContainer.appendChild(div);
    });
}

function addToList(id, name) {
    // Adiciona apenas o nome na lista de intenção de compra
    // Assim podemos verificar em qual mercado este item está mais barato
    if (!shoppingList.includes(name)) {
        shoppingList.push(name);
        saveList();
        renderShoppingList();
    }
}

function removeFromList(name) {
    shoppingList = shoppingList.filter(item => item !== name);
    saveList();
    renderShoppingList();
}

function clearList() {
    if (confirm('Tem certeza que deseja limpar sua lista?')) {
        shoppingList = [];
        saveList();
        renderShoppingList();
    }
}

function saveList() {
    localStorage.setItem('shoppingList', JSON.stringify(shoppingList));
}

async function renderShoppingList() {
    if (shoppingList.length === 0) {
        shoppingListContainer.innerHTML = '<p class="empty-state">Sua lista está vazia.</p>';
        cheapestMarketContainer.innerHTML = '';
        return;
    }

    shoppingListContainer.innerHTML = '<p class="empty-state"><i class="ph ph-spinner ph-spin"></i> Carregando preços da lista...</p>';

    try {
        let results = [];
        if (!supabaseClient) {
            results = shoppingList.map(itemName => mockSearch(itemName, ''));
        } else {
            const promises = shoppingList.map(itemName => 
                supabaseClient.from('produtos').select('*').ilike('produto', `%${itemName}%`).order('preco', { ascending: true })
            );
            results = await Promise.all(promises);
        }

        shoppingListContainer.innerHTML = '';
        
        shoppingList.forEach((itemName, index) => {
            const res = results[index];
            const data = res.data || [];
            
            // Acha o produto com menor preço por mercado para este item
            const marketProducts = {};
            data.forEach(prod => {
                const mkt = prod.supermercado;
                if (!marketProducts[mkt] || prod.preco < marketProducts[mkt].preco) {
                    marketProducts[mkt] = prod;
                }
            });

            // Formata o HTML com os preços e detalhes
            let pricesHtml = '';
            const markets = Object.keys(marketProducts);
            if (markets.length > 0) {
                // Ordena os mercados do mais barato pro mais caro
                markets.sort((a, b) => marketProducts[a].preco - marketProducts[b].preco);
                
                pricesHtml = '<div style="margin-top: 10px; font-size: 0.85rem; background: var(--bg-color); padding: 8px; border-radius: 8px; display: flex; flex-direction: column; gap: 8px;">';
                markets.forEach(mkt => {
                    const prod = marketProducts[mkt];
                    let detailsBadge = '';
                    if (prod.detalhes) {
                        detailsBadge = `<span style="background: #FEF3C7; color: #D97706; padding: 2px 6px; border-radius: 4px; font-size: 0.7rem; margin-left: 5px;">${prod.detalhes}</span>`;
                    }
                    let expInfo = prod.data_expiracao ? ` • Até ${prod.data_expiracao}` : '';
                    
                    pricesHtml += `
                    <div style="display: flex; flex-direction: column; padding: 6px; border: 1px solid var(--border-color); border-radius: 6px; background: white;">
                        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 4px;">
                            <div>
                                <div style="font-weight: 600; color: var(--text-main);"><i class="ph ph-storefront" style="color: var(--primary-color);"></i> ${formatMarketName(mkt)}</div>
                                <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 2px;">
                                    ${prod.produto} (${prod.unidade_medida || 'un'})${expInfo}
                                </div>
                            </div>
                            <div style="text-align: right;">
                                <strong style="color: var(--primary-color); font-size: 1rem;">R$ ${prod.preco.toFixed(2)}</strong>
                                <div>${detailsBadge}</div>
                            </div>
                        </div>
                    </div>`;
                });
                pricesHtml += '</div>';
            } else {
                pricesHtml = '<p style="font-size: 0.8rem; color: var(--text-muted); margin-top: 5px; font-style: italic;">Não encontrado nos mercados.</p>';
            }

            const div = document.createElement('div');
            div.className = 'product-card slide-up';
            div.style.flexDirection = 'column';
            div.style.alignItems = 'stretch';
            
            div.innerHTML = `
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <span class="product-name">${itemName}</span>
                    <button class="remove-btn" onclick="removeFromList('${itemName.replace(/'/g, "\\'")}')" title="Remover da lista">
                        <i class="ph ph-minus-circle"></i>
                    </button>
                </div>
                ${pricesHtml}
            `;
            shoppingListContainer.appendChild(div);
        });

        calculateCheapestMarketWithData(results);

    } catch (error) {
        console.error("Erro ao carregar lista:", error);
        shoppingListContainer.innerHTML = '<p class="empty-state" style="color: var(--danger-color);">Erro ao carregar os preços da lista.</p>';
    }
}

function calculateCheapestMarketWithData(results) {
    if (shoppingList.length === 0) {
        cheapestMarketContainer.innerHTML = '';
        return;
    }

    try {
        const marketTotals = {
            avenida: { total: 0, itemsFound: 0 },
            gigantao: { total: 0, itemsFound: 0 },
            jau_serve: { total: 0, itemsFound: 0 },
            panelao: { total: 0, itemsFound: 0 }
        };

        results.forEach((res) => {
            if (res.data && res.data.length > 0) {
                const cheapestPerMarket = {};
                
                res.data.forEach(prod => {
                    const mkt = prod.supermercado.toLowerCase();
                    if (marketTotals[mkt] !== undefined) {
                        if (!cheapestPerMarket[mkt] || prod.preco < cheapestPerMarket[mkt]) {
                            cheapestPerMarket[mkt] = prod.preco;
                        }
                    }
                });

                Object.keys(cheapestPerMarket).forEach(mkt => {
                    marketTotals[mkt].total += cheapestPerMarket[mkt];
                    marketTotals[mkt].itemsFound += 1;
                });
            }
        });

        let bestMarket = null;
        let bestScore = Infinity;

        Object.keys(marketTotals).forEach(mkt => {
            const stats = marketTotals[mkt];
            if (stats.itemsFound > 0) {
                const penalty = (shoppingList.length - stats.itemsFound) * 1000;
                const score = stats.total + penalty;
                
                if (score < bestScore) {
                    bestScore = score;
                    bestMarket = {
                        name: mkt,
                        total: stats.total,
                        itemsFound: stats.itemsFound
                    };
                }
            }
        });

        if (bestMarket) {
            cheapestMarketContainer.innerHTML = `
                <div class="cheapest-banner">
                    <i class="ph ph-tag"></i>
                    <div>
                        <strong>Melhor Opção Geral: ${formatMarketName(bestMarket.name)}</strong><br>
                        <small>Total: R$ ${bestMarket.total.toFixed(2)} (${bestMarket.itemsFound}/${shoppingList.length} itens da lista)</small>
                    </div>
                </div>
            `;
        } else {
            cheapestMarketContainer.innerHTML = '';
        }

    } catch (error) {
        console.error("Erro ao calcular melhor mercado:", error);
        cheapestMarketContainer.innerHTML = '';
    }
}

// Utilitário para formatar nomes
function formatMarketName(name) {
    if (!name) return 'Desconhecido';
    const names = {
        'avenida': 'Avenida',
        'gigantao': 'Gigantão',
        'jau_serve': 'Jaú Serve',
        'panelao': 'Panelão'
    };
    return names[name.toLowerCase()] || name;
}

// Dados mockados para quando o supabase não estiver configurado
function mockSearch(query, market) {
    const mockDB = [
        { id: 1, produto: 'Arroz Tio João 5kg', supermercado: 'avenida', preco: 22.90, unidade_medida: 'pct', detalhes: 'Leve 2 pague 1', data_expiracao: '30/09' },
        { id: 2, produto: 'Arroz Prato Fino 5kg', supermercado: 'gigantao', preco: 21.50, unidade_medida: 'pct', detalhes: '', data_expiracao: '25/09' },
        { id: 3, produto: 'Feijão Carioca 1kg', supermercado: 'jau_serve', preco: 8.90, unidade_medida: 'pct', detalhes: '', data_expiracao: '10/10' },
        { id: 4, produto: 'Feijão Preto 1kg', supermercado: 'panelao', preco: 7.99, unidade_medida: 'pct', detalhes: 'Oferta do dia', data_expiracao: '28/09' },
        { id: 5, produto: 'Leite Integral Parmalat', supermercado: 'avenida', preco: 4.50, unidade_medida: 'litro', detalhes: '', data_expiracao: '01/10' },
        { id: 6, produto: 'Leite Integral Jussara', supermercado: 'gigantao', preco: 4.30, unidade_medida: 'litro', detalhes: '', data_expiracao: '05/10' },
    ];

    let filtered = mockDB.filter(p => p.produto.toLowerCase().includes(query.toLowerCase()));
    if (market) {
        filtered = filtered.filter(p => p.supermercado === market);
    }
    
    // Ordenar por preço (do menor para o maior)
    filtered.sort((a, b) => a.preco - b.preco);

    return { data: filtered, error: null };
}
