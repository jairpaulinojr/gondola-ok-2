// --- CONFIGURAÇÃO DA API ---
// --- CONFIGURAÇÃO DO SUPABASE ---
const SUPABASE_URL = "https://jylcmvoynmmyvlpnkkhj.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_q3f4KYC25_TyGmUhY2x5Lg_biiO4j8h";

const supabase = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// --- FUNÇÃO PARA SALVAR NA NUVEM E LOCALMENTE ---
async function salvarDiaDaGestaoNoHist() {
    let historico = JSON.parse(localStorage.getItem("gondola_historico_checklists")) || [];

    let analiseGestao = {
        acao: "salvarDiaDaGestao", // Adicionado para a nuvem identificar a ação se necessário
        idSessao: Date.now(),
        setor: "Checklist Operacional",
        tipoMissao: "DIA_GESTAO",
        usuario: (typeof usuarioAtual !== "undefined" && usuarioAtual) ? usuarioAtual : "Administrador",
        data: new Date().toLocaleDateString("pt-BR"),
        hora: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        nota: 100,
        totalPerguntas: 1,
        conformes: 1,
        itensRespondidos: [{
            perguntaTexto: "Hoje é o dia da gestão, analise o comportamento da loja/missões, veja quais as pendencias.",
            setor: "Estratégico",
            resposta: "OK",
            observacao: "Auditoria analítica realizada pós-global"
        }]
    };

    // 1. Salva no armazenamento local do navegador
    historico.push(analiseGestao);
    localStorage.setItem("gondola_historico_checklists", JSON.stringify(historico));

    // 2. Envia para o Google Sheets via API usando a variável correta URL_API
    try {
        if (typeof URL_API !== 'undefined' && URL_API) {
            await fetch(URL_API, {
                method: "POST",
                mode: "no-cors",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(analiseGestao)
            });
            console.log("Dados sincronizados com sucesso!");
        }
    } catch (error) {
        console.error("Erro ao sincronizar com a nuvem:", error);
    }
}

// ==========================================
// 1. BANCOS DE DADOS SEPARADOS (Memória Local)
// ==========================================
let baseGlobalProdutos = JSON.parse(localStorage.getItem("gondola_base_global")) || []; 

let missoesPorSetor = JSON.parse(localStorage.getItem("gondola_missoes_setores")) || {
    "Mercearia Bebidas": [],
    "Mercearia Doce": [],
    "Mercearia Conservas": [],
    "Mercearia Alto Giro": [],
    "Mercearia Limpeza": [],
    "Frios Iogurte": [],
    "Frios Congelados": [],
    "Açougue": [],
    "Padaria": []
};

let produtosDoDia = [];        
let usuarioAtual = "";
let setorSelecionado = "";
let indiceAtual = 0;
let html5QrcodeScanner = null;
// --- ADICIONE APENAS ESTAS LINHAS ABAIXO PARA O CHECKLIST ---
let checklistGerencialDoDia = JSON.parse(localStorage.getItem("gondola_checklist_dia")) || [];
let respostasChecklistAtual = JSON.parse(localStorage.getItem("gondola_respostas_checklist_atual")) || {};
let historicoChecklistsSalvos = JSON.parse(localStorage.getItem("gondola_historico_checklists")) || [];

async function salvarEtiquetaPendente(codigoBarras, descricaoProduto, lojaUser, setorUser) {
    if (!supabaseClient) {
        console.error("Cliente Supabase não inicializado.");
        return false;
    }

    const novaEtiqueta = {
        "codigo de barras": String(codigoBarras).trim(),
        "descricao": String(descricaoProduto).trim(),
        "loja": lojaUser,
        "setor": setorUser,
        "status": "pendente",
        "data_criacao": new Date().toISOString()
    };

    const { data, error } = await supabaseClient
        .from('etiquetas_pendentes')
        .insert([novaEtiqueta])
        .select();

    if (error) {
        console.error("Erro ao salvar etiqueta pendente:", error.message);
        alert("Erro ao enviar etiqueta para o Supabase.");
        return false;
    }

    console.log("Etiqueta pendente salva com sucesso!", data);
    return true;
}

async function salvarRegistroValidade(codigoBarras, descricaoProduto, dataValidade, quantidadeItem, lojaUser, setorUser) {
    if (!supabaseClient) {
        console.error("Cliente Supabase não inicializado.");
        return false;
    }

    const registroValidade = {
        "codigo de barras": String(codigoBarras).trim(),
        "descricao": String(descricaoProduto).trim(),
        "validade": dataValidade,
        "quantidade": Number(quantidadeItem),
        "loja": lojaUser,
        "setor": setorUser,
        "usuario": usuarioAtual || "Operador",
        "data_registro": new Date().toISOString()
    };

    const { data, error } = await supabaseClient
        .from('validade')
        .insert([registroValidade])
        .select();

    if (error) {
        console.error("Erro ao salvar validade:", error.message);
        alert("Erro ao registrar validade no Supabase.");
        return false;
    }

    console.log("Validade salva com sucesso!", data);
    alert("Registro de validade enviado com sucesso para a nuvem!");
    return true;
}

// ==========================================
// 3. FUNÇÃO DE LOGIN E CONSULTA NO SUPABASE
// ==========================================

async function entrar() {
    let campoNome = document.getElementById("nome");
    let campoMatricula = document.getElementById("matricula");

    if (!campoNome || !campoMatricula) {
        alert("Erro técnico: Elementos de login não encontrados.");
        return;
    }

    let nome = campoNome.value.trim();
    let matricula = campoMatricula.value.trim().toLowerCase();

    if (nome === "" || matricula === "") {
        alert("Preencha Nome e Matrícula.");
        return;
    }

    if (matricula === "admin" || nome.toLowerCase() === "admin") {
        usuarioAtual = "Administrador";
        abrirPainelAdmin();
        return; 
    } 
    
    usuarioAtual = nome;

    // Salva o usuário e o setor/matrícula no aparelho (memória temporária)
    localStorage.setItem("usuarioAtual", nome);
    localStorage.setItem("setorAtual", matricula); 

    // Consulta os dados do setor diretamente no Supabase
    await carregarDadosSetorSupabase(matricula);

    voltarMenuPrincipal();
}

// Função para buscar dados da tabela centralizada no Supabase filtrados por setor/loja
async function carregarDadosSetorSupabase(setorDoColaborador) {
    if (!supabaseClient) {
        console.error("Cliente Supabase não inicializado.");
        return;
    }

    try {
        let { data, error } = await supabaseClient
            .from('cadastro_global') // ou a tabela correspondente às missões/etiquetas
            .select('*')
            .eq('setor', setorDoColaborador);

        if (error) {
            console.error("Erro ao carregar dados do Supabase:", error.message);
            return;
        }

        if (data && data.length > 0) {
            // Salva o cache temporário local apenas para operação offline se necessário
            localStorage.setItem("etiquetas_pendentes", JSON.stringify(data));
            console.log("✅ Dados sincronizados do Supabase com sucesso!");
        } else {
            console.log("⚠️ Nenhum registro encontrado para este setor no Supabase.");
        }
    } catch (err) {
        console.error("Erro de conexão com o Supabase:", err);
    }
}

function mostrarTelaLoginInicial() {
    usuarioAtual = ""; 
    let container = document.querySelector(".container");
    if (!container) return;

    container.innerHTML = `
        <div class="topo">
            <h1>🛒 GÔNDOLA OK</h1>
            <p>Faça seu login para iniciar</p>
        </div>
        <div class="login">
            <label for="nome">Nome do Colaborador:</label>
            <input type="text" id="nome" placeholder="Digite seu nome completo">

            <label for="matricula">Matrícula / Setor:</label>
            <input type="password" id="matricula" placeholder="Digite sua matrícula ou setor">

            <button onclick="entrar()" style="background-color: #28a745; color: white;">Entrar no Sistema</button>
        </div>
    `;
}

// ==========================================================
// FUNÇÕES UTILITÁRIAS DE INTERFACE
// ==========================================================
function alternarVisibilidadeEntregas() {
    let painel = document.getElementById("container-entregas-monitor");
    let botao = document.getElementById("btn-toggle-entregas");

    if (!painel || !botao) return;

    if (painel.style.display === "none" || painel.style.display === "") {
        painel.style.display = "block";
        botao.innerHTML = "📊 Monitoramento de Entregas (Fechar)";
    } else {
        painel.style.display = "none";
        botao.innerHTML = "📊 Monitoramento de Entregas (Abrir)";
    }
}

function alternarVisibilidadeFicheiros() {
    let painel = document.getElementById("container-ficheiros-upload");
    let botao = document.getElementById("btn-toggle-ficheiros");

    if (!painel || !botao) return;

    if (painel.style.display === "none" || painel.style.display === "") {
        painel.style.display = "block";
        botao.innerHTML = "📂 Importar Planilhas / Ficheiros (Fechar)";
    } else {
        painel.style.display = "none";
        botao.innerHTML = "📂 Importar Planilhas / Ficheiros (Abrir)";
    }
}

// ==========================================
// 5. MENU PRINCIPAL DO REPOSITOR (USUÁRIO)
// ==========================================
function voltarMenuPrincipal() {
    if (html5QrcodeScanner) {
        try {
            html5QrcodeScanner.clear();
        } catch(e) {}
    }

    let container = document.querySelector(".container");
    if (!container) return;

    container.innerHTML = `
        <div class="topo">
            <h1>🛒 GÔNDOLA OK</h1>
            <p>Operador: <strong>${usuarioAtual || "Não Identificado"}</strong></p>
        </div>

        <div class="login">
            <h2>Selecione seu Setor</h2>

            <button onclick="prepararMissaoSetor('Mercearia Bebidas')">🥤 Mercearia Bebidas</button>
            <button onclick="prepararMissaoSetor('Mercearia Doce')">🍬 Mercearia Doce</button><br><br>

            <button onclick="prepararMissaoSetor('Mercearia Conservas')">🥫 Mercearia Conservas</button><br><br>

            <button onclick="prepararMissaoSetor('Mercearia Alto Giro')">🔄 Mercearia Alto Giro</button><br><br>

            <button onclick="prepararMissaoSetor('Mercearia Limpeza')">🧴 Mercearia Limpeza</button><br><br>

            <button onclick="prepararMissaoSetor('Frios Iogurte')">🥛 Frios Iogurte</button><br><br>

            <button onclick="prepararMissaoSetor('Frios Congelados')">🧊 Frios Congelados</button><br><br>

            <button onclick="prepararMissaoSetor('Açougue')">🥩 Açougue</button><br><br>

            <button onclick="prepararMissaoSetor('Padaria')">🍞 Padaria</button>

            <hr style="margin:20px 0; border:0; border-top:1px solid #ccc;">

            <h2>Serviços de Apoio</h2>

            <button onclick="abrirAbaValidade()" style="background:#20c997; color:white;">
                📅 Verificar Validade (Supabase)
            </button>

            <button onclick="abrirAbaEtiquetas()" style="background:#ffc107; color:black; margin-top:10px;">
                🏷️ Etiquetas Pendentes
            </button>

            <hr style="margin:20px 0; border:0; border-top:1px solid #ccc;">

            <h2>🚚 Sistema de Entregas</h2>

            <button onclick="abrirAbaLancamentoEntrega()" style="background:#0275d8; color:white;">
                📦 Lançar Novas Entregas (Fiscal)
            </button>

            <button onclick="abrirAbaMotoristaEntrega()" style="background:#5cb85c; color:white; margin-top:10px; width:100%;">
                🛣️ Entregas para Fazer (Motorista)
            </button>

            <button onclick="mostrarTelaLoginInicial()" style="background:#6c757d; color:white; margin-top:20px;">
                ⬅️ Sair do App
            </button>
        </div>
    `;
}

// ==========================================
// 6. SORTEIO ALEATÓRIO DA MISSÃO (MÁX 20 ITENS)
// ==========================================
async function prepararMissaoSetor(setor) {
    setorSelecionado = setor;
    indiceAtual = 0;

    // Tenta carregar missões do cache ou busca do Supabase
    let todosDoSetor = missoesPorSetor[setor] || [];

    if (todosDoSetor.length === 0 && supabaseClient) {
        let { data } = await supabaseClient
            .from('cadastro_global')
            .select('*')
            .eq('setor', setor);
        
        if (data) todosDoSetor = data;
    }

    if (todosDoSetor.length === 0) {
        alert("Atenção: Nenhuma lista de missão encontrada para o setor: " + setor);
        return;
    }

    let copiaProdutos = JSON.parse(JSON.stringify(todosDoSetor));

    for (let i = copiaProdutos.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [copiaProdutos[i], copiaProdutos[j]] = [copiaProdutos[j], copiaProdutos[i]];
    }

    produtosDoDia = copiaProdutos.slice(0, 20);
    mostrarProdutoAtual();
}

// ==========================================
// 7. CHECKLIST INTERATIVO DE LOJA
// ==========================================
function mostrarProdutoAtual() {
    let container = document.querySelector(".container");
    if (!container) return;

    if (indiceAtual >= produtosDoDia.length) {
        mostrarTelaValidacaoMissao();
        return;
    }

    let produto = produtosDoDia[indiceAtual];

    container.innerHTML = `
    <div class="topo">
        <h1>🛒 GÔNDOLA OK</h1>
        <p>${setorSelecionado} (${indiceAtual + 1}/${produtosDoDia.length})</p>
    </div>

    <div class="login">
        <p><strong>Código:</strong> ${produto['codigo de barras'] || produto.codigo || '-'}</p>
        <p><strong>Produto:</strong> ${produto.descricao || produto.PRODUTO || '-'}</p>
        <br>

        <h3>O produto está abastecido?</h3>

        <button id="btn-abs-sim" onclick="respostaAbastecido(true)" style="background:#e0e0e0;color:black;margin-bottom:8px;">
            🟢 SIM
        </button>

        <button id="btn-abs-nao" onclick="respostaAbastecido(false)" style="background:#e0e0e0;color:black;margin-bottom:8px;">
            🔴 NÃO
        </button>

        <br><br>

        <div id="bloco-preco" style="display:none;">
            <h3>Está precificado?</h3>

            <button id="btn-prc-sim" onclick="respostaPrecificado(true)" style="background:#e0e0e0;color:black;margin-bottom:8px;">
                🟢 SIM
            </button>

            <button id="btn-prc-nao" onclick="respostaPrecificado(false)" style="background:#e0e0e0;color:black;margin-bottom:8px;">
                🔴 NÃO
            </button>

            <br><br>
        </div>

        <button id="btn-proximo" style="display:none;background:#28a745;color:white;width:100%;padding:10px;" onclick="proximoProduto()">
            ➡️ Avançar
        </button>
    </div>
    `;
}

function respostaAbastecido(valor) {
    let produto = produtosDoDia[indiceAtual];
    produto.abastecido = valor;

    document.getElementById("btn-abs-sim").style.background = valor ? "#28a745" : "#e0e0e0";
    document.getElementById("btn-abs-sim").style.color = valor ? "white" : "black";

    document.getElementById("btn-abs-nao").style.background = !valor ? "#dc3545" : "#e0e0e0";
    document.getElementById("btn-abs-nao").style.color = !valor ? "white" : "black";

    let blocoPreco = document.getElementById("bloco-preco");
    let btnProximo = document.getElementById("btn-proximo");

    if (valor) {
        produto.statusRuptura = false;
        blocoPreco.style.display = "block";
        btnProximo.style.display = "none";
    } else {
        produto.statusRuptura = true;
        produto.precificado = "Bloqueado por Ruptura";
        blocoPreco.style.display = "none";
        btnProximo.style.display = "block";
    }
}

function respostaPrecificado(valor) {
    let produto = produtosDoDia[indiceAtual];
    produto.precificado = valor;

    document.getElementById("btn-prc-sim").style.background = valor ? "#28a745" : "#e0e0e0";
    document.getElementById("btn-prc-sim").style.color = valor ? "white" : "black";

    document.getElementById("btn-prc-nao").style.background = !valor ? "#dc3545" : "#e0e0e0";
    document.getElementById("btn-prc-nao").style.color = !valor ? "white" : "black";

    document.getElementById("btn-proximo").style.display = "block";
}

function proximoProduto() {
    produtosDoDia[indiceAtual] = { ...produtosDoDia[indiceAtual] };
    indiceAtual++;
    mostrarProdutoAtual();
}

function mostrarTelaValidacaoMissao() {
    let total = produtosDoDia.length;
    let abastecidos = produtosDoDia.filter(p => p.abastecido === true).length;
    let rupturas = produtosDoDia.filter(p => p.statusRuptura === true).length;
    let semPreco = produtosDoDia.filter(p => p.precificado === false).length;

    document.querySelector(".container").innerHTML = `
        <div class="topo">
            <h1>📋 REVISÃO DA MISSÃO</h1>
            <p>${setorSelecionado}</p>
        </div>

        <div class="login" style="max-width:100%; text-align:left;">
            <div style="background:#e9ecef;padding:12px;border-radius:5px;margin-bottom:15px;font-size:14px;line-height:1.6;">
                📊 <strong>Resumo dos Itens Verificados:</strong><br>
                📦 Total: <strong>${total}</strong><br>
                🟢 Abastecidos: <strong style="color:green;">${abastecidos}</strong><br>
                🔴 Rupturas: <strong style="color:red;">${rupturas}</strong><br>
                🏷️ Sem Preço: <strong style="color:#fd7e14;">${semPreco}</strong>
            </div>

            <p style="font-size:12px;color:#6c757d;text-align:center;margin-bottom:15px;">
                ⚠️ Confira as informações antes de gravar no Supabase.
            </p>

            <div style="display:flex;gap:10px;">
                <button onclick="finalizarEGravarMissao()" style="background:#28a745;color:white;width:60%;padding:12px;font-weight:bold;">
                    ✅ Confirmar e Gravar
                </button>

                <button onclick="if(confirm('Deseja cancelar esta amostragem?')) voltarMenuPrincipal()" style="background:#dc3545;color:white;width:40%;padding:12px;">
                    ❌ Cancelar
                </button>
            </div>
        </div>
    `;
}

// ==========================================
// 8. FINALIZAÇÃO E GRAVAÇÃO NO SUPABASE
// ==========================================
async function finalizarEGravarMissao() {
    if (!supabaseClient) {
        alert("Erro de conexão com o banco de dados.");
        return;
    }

    // Processa etiquetas pendentes para os produtos sem preço
    for (let p of produtosDoDia) {
        if (p.precificado === false) {
            let cod = p['codigo de barras'] || p.codigo;
            let desc = p.descricao || p.PRODUTO;
            await salvarEtiquetaPendente(cod, desc, localStorage.getItem("lojaAtual") || "Geral", setorSelecionado);
        }
    }

    document.querySelector(".container").innerHTML = `
        <div class="topo">
            <h1>🛒 GÔNDOLA OK</h1>
            <h2>Missão Gravada!</h2>
        </div>
        <div class="login" style="text-align: center;">
            <p style="color:green; font-weight:bold; font-size:16px;">🎉 Auditoria enviada diretamente ao Supabase com sucesso!</p>
            <button onclick="voltarMenuPrincipal()" style="background-color: #6c757d; color: white; width:100%; padding:10px; margin-top:10px;">Voltar ao Menu</button>
        </div>
    `;
}

let scannerValidade = null;

// ==========================================
// 9. REPOSITOR: ABA VALIDADE (SUPABASE)
// ==========================================
function abrirAbaValidade() {
    if (scannerValidade) {
        try { scannerValidade.clear(); } catch(e) {}
        scannerValidade = null;
    }

    document.querySelector(".container").innerHTML = `
        <div class="topo">
            <h1>📅 VERIFICAÇÃO DE VALIDADE</h1>
        </div>
        <div class="login" style="max-width:100%;">
            <div id="leitor-camera" style="width: 100%; max-width: 350px; margin: 0 auto;"></div>
            <br>
            
            <input type="text" id="input-manual-code" placeholder="Bipe ou digite o item...">
            <button onclick="buscarProdutoValidade(document.getElementById('input-manual-code').value)" style="padding:10px; margin-top:5px; background:#28a745; color:white; width:100%; border:none; border-radius:5px; font-weight:bold; cursor:pointer;">🔍 VERIFICAR PRODUTO</button>
            
            <div id="resultado-validade" style="margin-top: 20px; display:none; text-align:left; background:#f9f9f9; padding:15px; border-radius:5px; border: 1px solid #ddd;"></div>
            <br>
            <button onclick="fecharValidadeEVoltar()" style="background:#6c757d; color:white; width:100%; padding:10px; border:none; border-radius:5px; font-weight:bold; cursor:pointer;">⬅️ Voltar ao Menu</button>
        </div>
    `;

    setTimeout(() => {
        try {
            scannerValidade = new Html5QrcodeScanner("leitor-camera", { 
                fps: 10, 
                qrbox: { width: 250, height: 150 }
            });

            scannerValidade.render((codigoLido) => {
                document.getElementById("input-manual-code").value = codigoLido;
                try { scannerValidade.clear(); } catch(e) {}
                scannerValidade = null;
                buscarProdutoValidade(codigoLido);
            }, (erro) => {});
        } catch (err) {
            console.error("Erro ao abrir a câmera:", err);
        }
    }, 200);
}

function fecharValidadeEVoltar() {
    if (scannerValidade) {
        try { scannerValidade.clear(); } catch(e) {}
        scannerValidade = null;
    }
    voltarMenuPrincipal();
}

async function buscarProdutoValidade(codigoBarras) {
    let codigoLimpo = codigoBarras ? codigoBarras.trim() : "";
    let display = document.getElementById("resultado-validade");
    display.style.display = "block";

    if (!codigoLimpo) {
        display.innerHTML = `<p style="color:red; text-align:center;">❌ Digite ou escaneie um código válido.</p>`;
        return;
    }

    display.innerHTML = `<p style="text-align:center; color:#6c757d;">🔍 Buscando produto no Supabase...</p>`;

    // Consulta no Supabase via função do cadastro global
    let produtos = await buscarProdutoCadastroGlobal(codigoLimpo);

    if (!produtos || produtos.length === 0) {
        display.innerHTML = `<p style="color:red; text-align:center;">❌ Produto não localizado no Cadastro Global do Supabase.</p>`;
        return;
    }

    let produtoEncontrado = produtos[0];
    let nomeProduto = produtoEncontrado.PRODUTO || produtoEncontrado.descricao || "Produto Sem Nome";
    let codProduto = produtoEncontrado['CODIGO DE BARRAS'] || produtoEncontrado.codigo || codigoLimpo;

    display.innerHTML = `
        <p><strong>Produto:</strong> ${nomeProduto}</p>
        <p><strong>Código:</strong> ${codProduto}</p>
        <label><strong>Data de Vencimento:</strong></label>
        <input type="date" id="data-venc" style="width:100%; padding:8px; margin: 10px 0;">
        <label><strong>Quantidade:</strong></label>
        <input type="number" id="qtd-venc" value="1" style="width:100%; padding:8px; margin: 10px 0;">
        <button onclick="confirmarValidadeSupabase('${codProduto}', '${nomeProduto.replace(/'/g, "\\'")}')" style="background:#28a745; color:white; width:100%; padding:10px; border:none; border-radius:5px; font-weight:bold; cursor:pointer;">Salvar Data e Qtd</button>
    `;
}

async function confirmarValidadeSupabase(codigo, descricao) {
    let dataVal = document.getElementById("data-venc").value;
    let qtdVal = document.getElementById("qtd-venc").value;

    if (!dataVal) { 
        alert("Escolha uma data de vencimento!"); 
        return; 
    }

    let partes = dataVal.split("-");
    let dataFormatada = `${partes[2]}/${partes[1]}/${partes[0]}`;

    let loja = localStorage.getItem("lojaAtual") || "Geral";
    let setor = setorSelecionado || localStorage.getItem("setorAtual") || "Geral";

    let sucesso = await salvarRegistroValidade(codigo, descricao, dataFormatada, qtdVal, loja, setor);
    
    if (sucesso) {
        abrirAbaValidade();
    }
}

// ==========================================
// 10. REPOSITOR: ABA PREÇOS / ETIQUETAS (SUPABASE)
// ==========================================
async function abrirAbaEtiquetas() {
    document.querySelector(".container").innerHTML = `
        <div class="topo">
            <h1>🏷️ PRODUTOS SEM PREÇO</h1>
            <p>Carregando dados do Supabase...</p>
        </div>
        <div class="login" style="max-width:100%; text-align:center; padding: 20px;">
            <p style="color:#6c757d;">⏳ Sincronizando com o banco de dados...</p>
        </div>
    `;

    let etiquetas = [];
    if (supabaseClient) {
        let { data, error } = await supabaseClient
            .from('etiquetas_pendentes')
            .select('*');

        if (!error && data) {
            etiquetas = data;
        }
    }

    let lines = "";
    if (etiquetas.length === 0) {
        lines = `<tr><td colspan="2" style="text-align:center; padding:20px; color: green; font-weight: bold;">🎉 Nenhum produto sem preço pendente!</td></tr>`;
    } else {
        etiquetas.forEach((e) => {
            let desc = e.descricao || e.PRODUTO || "Produto";
            let cod = e["codigo de barras"] || e.codigo || "-";

            lines += `
                <tr style="border-bottom: 1px solid #ddd;">
                    <td style="padding:12px; font-size:14px; line-height: 1.4;">
                        <strong>${desc}</strong><br>
                        <span style="font-family: monospace; font-size: 15px; color: #333; background: #eee; padding: 2px 6px; border-radius: 3px;">
                            ${cod}
                        </span>
                    </td>
                    <td style="padding:12px; text-align:center; width: 90px;">
                        <button onclick="darBaixaEtiquetaSupabase('${cod}')" style="background:#28a745; color:white; padding:8px 10px; font-size:12px; border:none; border-radius:4px; font-weight:bold; cursor:pointer;">
                            ✓ Feito
                        </button>
                    </td>
                </tr>
            `;
        });
    }

    document.querySelector(".container").innerHTML = `
        <div class="topo">
            <h1>🏷️ PRODUTOS SEM PREÇO</h1>
            <p>Sincronizado com o Supabase</p>
        </div>
        <div class="login" style="max-width:100%; padding: 0;">
            <div style="background: #e2e3e5; padding: 10px; border-radius: 5px; margin-bottom: 15px; font-size: 13px; color: #383d41; text-align: center;">
                📋 <strong>Total pendente: ${etiquetas.length} itens</strong>
            </div>
            
            <table style="width:100%; border-collapse:collapse; text-align:left; background: white;">
                <thead>
                    <tr style="background:#f2f2f2; border-bottom: 2px solid #ccc;">
                        <th style="padding:10px; font-size: 13px;">Produto / Código de Barras</th>
                        <th style="padding:10px; text-align:center; font-size: 13px;">Ação</th>
                    </tr>
                </thead>
                <tbody>${lines}</tbody>
            </table>
            <br>
            <button onclick="voltarMenuPrincipal()" style="background:#6c757d; color:white; width:100%; padding:10px; border:none; border-radius:5px; font-weight:bold;">⬅️ Voltar ao Menu</button>
        </div>
    `;
}

async function darBaixaEtiquetaSupabase(codigoProduto) {
    if (!confirm("Deseja realmente dar baixa nesta etiqueta?")) return;

    if (!supabaseClient) {
        alert("Erro de conexão.");
        return;
    }

    let { error } = await supabaseClient
        .from('etiquetas_pendentes')
        .delete()
        .eq('codigo de barras', codigoProduto);

    if (error) {
        console.error("Erro ao remover etiqueta:", error.message);
        alert("Não foi possível dar baixa na etiqueta.");
    } else {
        alert("Baixa realizada com sucesso!");
    }

    abrirAbaEtiquetas();
}

// ==========================================
// 11. GESTÃO DE VALIDADES: GERENTE (FILTRADO POR HOJE) - NUVEM / GOOGLE SHEETS
// ==========================================
async function abrirRelatorioValidadesGerente() {
    document.querySelector(".container").innerHTML = `
        <div class="topo"><h1>📅 GESTÃO DE VALIDADES</h1></div>
        <div class="login" style="max-width: 100%; text-align: center; padding: 20px;">
            <p style="color:#6c757d;">⏳ Carregando relatórios de validade da nuvem...</p>
        </div>
    `;

    let todosRegistros = [];
    let hojeStr = new Date().toLocaleDateString();

    try {
        let resposta = await fetch(`${URL_API_GAS}?acao=listarValidades`);
        let resultado = await resposta.json();
        if (resultado && resultado.registros) {
            todosRegistros = resultado.registros;
        }
    } catch (e) {
        todosRegistros = JSON.parse(localStorage.getItem("registro_validades")) || [];
    }
    
    let registros = todosRegistros.filter(r => r.status !== "Resolvido" && r.dataRegistro === hojeStr); 
    let linhas = "";

    if (registros.length === 0) {
        linhas = `<tr><td colspan="4" style="text-align:center; padding:20px; color: green; font-weight: bold;">🎉 Nenhum registro de validade pendente para hoje!</td></tr>`;
    } else {
        registros.forEach((r) => {
            let estiloTratado = r.status === "Tratado" ? "background:#e8f4fd;" : "background:#ffffff;";
            let qtd = r.quantidade || 1; 

            linhas += `
                <tr style="${estiloTratado} border-bottom: 1px solid #ddd; font-size: 13px;">
                    <td style="padding: 10px;"><strong>${r.descricao}</strong><br><small>Cód: ${r.codigo}</small></td>
                    <td style="padding: 10px; text-align:center; color:red; font-weight:bold;">${r.dataValidade}</td>
                    <td style="padding: 10px; text-align:center;">${qtd}</td>
                    <td style="padding: 10px; text-align:center;">
                        <button onclick="atualizarStatusNuvem('${r.codigo}', '${r.dataValidade}', 'Tratado')" style="background:#007bff; color:white; border:none; padding:5px; margin:2px; cursor:pointer;">Tratar</button>
                        <button onclick="atualizarStatusNuvem('${r.codigo}', '${r.dataValidade}', 'Resolvido')" style="background:#28a745; color:white; border:none; padding:5px; margin:2px; cursor:pointer;">Resolver</button>
                    </td>
                </tr>
            `;
        });
    }

    document.querySelector(".container").innerHTML = `
        <div class="topo"><h1>📅 GESTÃO DE VALIDADES</h1></div>
        <div class="login" style="max-width: 100%; padding: 10px;">
            <p style="font-size:12px; color:#495057; text-align:center; background:#e2e3e5; padding:5px; margin-bottom:10px; border-radius:4px;">👁️ Exibindo apenas os registros adicionados <strong>Hoje (${hojeStr})</strong></p>
            <button onclick="exportarParaExcel('Relatorio_Validades_Completo', 'registro_validades')" style="width:100%; background:#6c757d; color:white; padding:10px; margin-bottom:10px;">📥 Exportar Histórico Completo (Excel)</button>
            <table style="width: 100%; border-collapse: collapse;">
                <tr style="background:#f2f2f2;"><th style="padding:8px;">Prod</th><th style="padding:8px;">Venc</th><th style="padding:8px;">Qtd</th><th style="padding:8px;">Ação</th></tr>
                ${linhas}
            </table>
            <button onclick="abrirPainelAdmin()" style="width:100%; margin-top:10px;">Voltar</button>
        </div>
    `;
}

window.atualizarStatusNuvem = async function(codigo, dataValidade, novoStatus) {
    if (!confirm(`Deseja alterar o status para "${novoStatus}"?`)) return;

    try {
        await fetch(`${URL_API_GAS}?acao=atualizarStatusValidade&codigo=${codigo}&dataValidade=${dataValidade}&status=${novoStatus}`, {
            method: 'POST'
        });
        alert("Status atualizado na nuvem: " + novoStatus);
    } catch (e) {
        let registros = JSON.parse(localStorage.getItem("registro_validades")) || [];
        let item = registros.find(r => r.codigo === codigo && r.dataValidade === dataValidade);
        if (item) {
            item.status = novoStatus;
            localStorage.setItem("registro_validades", JSON.stringify(registros));
        }
        alert("Status atualizado localmente: " + novoStatus);
    }
    
    abrirRelatorioValidadesGerente();
};


async function abrirRelatorioValidadesGerente() {
    let container = document.querySelector(".container");
    if (!container) return;

    // Busca dados atualizados da nuvem (ou localStorage)
    let resposta = await fetch(URL_API_GAS + "?acao=obterValidades");
    let validades = await resposta.json();

    let linhasHtml = validades.map((item, index) => `
        <tr style="border-bottom: 1px solid #ddd;">
            <td style="padding: 8px;">${item.validade}</td>
            <td style="padding: 8px;">${item.codigo}</td>
            <td style="padding: 8px;">${item.descricao}</td>
            <td style="padding: 8px; text-align:center;">${item.quantidade}</td>
            <td style="padding: 8px; text-align:center;">
                <select onchange="atualizarTratativaValidade('${item.codigo}', this.value)" style="padding: 4px; font-weight:bold;">
                    <option value="Pendente" ${item.tratar === 'Pendente' ? 'selected' : ''}>Pendente</option>
                    <option value="Rebaixa" ${item.tratar === 'Rebaixa' ? 'selected' : ''}>Rebaixa</option>
                    <option value="Resolvido" ${item.tratar === 'Resolvido' ? 'selected' : ''}>Resolvido</option>
                </select>
            </td>
        </tr>
    `).join("");

    container.innerHTML = `
        <div class="topo"><h1>📅 CONTROLE DE VENCIMENTOS</h1></div>
        <div class="login" style="text-align: left; max-width: 100%;">
            
            <div style="display: flex; gap: 10px; margin-bottom: 15px;">
                <button onclick="exportarValidadeExcel()" style="background:#28a745; color:white; flex:1;">📥 Baixar Relatório em Excel</button>
                <button onclick="abrirPainelAdmin()" style="background:#6c757d; color:white; flex:1;">⬅️ Voltar ao Painel</button>
            </div>

            <div style="max-height: 350px; overflow-y: auto; background: white; border: 1px solid #ccc; border-radius: 4px;">
                <table style="width: 100%; border-collapse: collapse; font-size: 12px; text-align: left;">
                    <thead>
                        <tr style="background: #efefef; position: sticky; top: 0;">
                            <th style="padding: 8px;">Validade</th>
                            <th style="padding: 8px;">Código</th>
                            <th style="padding: 8px;">Descrição</th>
                            <th style="padding: 8px; text-align:center;">Qtd</th>
                            <th style="padding: 8px; text-align:center;">Tratar</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${validades.length === 0 ? `<tr><td colspan="5" style="padding:15px; text-align:center; color:#777;">Nenhum produto próximo ao vencimento.</td></tr>` : linhasHtml}
                    </tbody>
                </table>
            </div>
        </div>
    `;
}

// Função para atualizar o status e remover da tela/planilha se for "Resolvido"
async function atualizarTratativaValidade(codigo, novoStatus) {
    try {
        await fetch(URL_API_GAS, {
            method: "POST",
            mode: "no-cors",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                acao: "atualizarStatusValidade",
                codigo: codigo,
                tratar: novoStatus
            })
        });

        if (novoStatus === "Resolvido") {
            alert("✅ Item resolvido e removido do arquivo com sucesso!");
        } else {
            alert("✅ Tratativa atualizada para: " + novoStatus);
        }
        
        abrirRelatorioValidadesGerente(); // Recarrega a tela
    } catch (e) {
        console.error("Erro ao atualizar tratativa:", e);
        alert("Erro ao atualizar na nuvem.");
    }
}

// Função para gerar o arquivo Excel (.xlsx)
async function exportarValidadeExcel() {
    let resposta = await fetch(URL_API_GAS + "?acao=obterValidades");
    let dados = await resposta.json();

    if (!dados || dados.length === 0) {
        alert("Não há dados para exportar!");
        return;
    }

    let ws = XLSX.utils.json_to_sheet(dados);
    let wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Validades");
    XLSX.writeFile(wb, "Relatorio_Validade_" + new Date().toLocaleDateString("pt-BR").replace(/\//g, "-") + ".xlsx");
}
// ==========================================
// 12. GERENTE: SELEÇÃO DE ABAS AUDITORIA
// ==========================================
function abrirMenuSetoresGerente() {
    document.querySelector(".container").innerHTML = `
        <div class="topo">
            <h1>🚨 FILA DE RUPTURAS CRÍTICAS</h1>
            <p>Selecione o setor para ver apenas o que está em falta</p>
        </div>
        <div class="login">
            <button onclick="abrirAbaGerente('Mercearia Bebidas')" style="background:#dc3545; color:white;">🥤 Mercearia Bebidas</button>
            <button onclick="abrirAbaGerente('Mercearia Doce')" style="background:#dc3545; color:white;">🍬 Mercearia Doce</button>
            <button onclick="abrirAbaGerente('Mercearia Conservas')" style="background:#dc3545; color:white;">🥫 Mercearia Conservas</button>
            <button onclick="abrirAbaGerente('Mercearia Alto Giro')" style="background:#dc3545; color:white;">🔄 Mercearia Alto Giro</button>
            <button onclick="abrirAbaGerente('Mercearia Limpeza')" style="background:#dc3545; color:white;">🧴 Mercearia Limpeza</button>
            <button onclick="abrirAbaGerente('Frios Iogurte')" style="background:#dc3545; color:white;">🥛 Frios Iogurte</button>
            <button onclick="abrirAbaGerente('Frios Congelados')" style="background:#dc3545; color:white;">🧊 Frios Congelados</button>
            <button onclick="abrirAbaGerente('Açougue')" style="background:#dc3545; color:white;">🥩 Açougue</button>
            <button onclick="abrirAbaGerente('Padaria')" style="background:#dc3545; color:white;">🍞 Padaria</button>
            
            <hr style="margin: 20px 0; border: 0; border-top: 1px solid #ccc;">
            <button onclick="abrirPainelAdmin()" style="background-color: #6c757d; color: white; width: 100%;">Voltar ao Painel Admin</button>
        </div>
    `;
}
// ==========================================
// 13. GERENTE: FILA COM ITENS COM RUPTURA ATIVA - NUVEM / GOOGLE SHEETS
// ==========================================
async function abrirAbaGerente(setorFiltro) {
    let container = document.querySelector(".container");
    if (!container) return;

    container.innerHTML = `
        <div class="topo">
            <h1>🚨 RUPTURAS: ${setorFiltro.toUpperCase()}</h1>
            <p>Carregando dados da nuvem...</p>
        </div>
        <div class="login" style="max-width: 100%; text-align: center; padding: 20px;">
            <p style="color:#6c757d;">⏳ Buscando rupturas pendentes...</p>
        </div>
    `;

    let dados = [];
    try {
        if (typeof URL_API_GAS !== 'undefined' && URL_API_GAS) {
            let resposta = await fetch(`${URL_API_GAS}?acao=listarRupturas&setor=${encodeURIComponent(setorFiltro)}`);
            let resultado = await resposta.json();
            if (resultado && resultado.rupturas) {
                dados = resultado.rupturas;
            }
        }
    } catch (e) {
        let localDados = JSON.parse(localStorage.getItem("gondola_dados")) || [];
        dados = localDados.filter(p => p.setor === setorFiltro);
    }

    let rupturasPendentesSetor = dados.filter(p => p.statusRuptura === true && p.tratadoRuptura !== true);

    let linesTabela = "";
    if (rupturasPendentesSetor.length === 0) {
        linesTabela = `<tr><td colspan="3" style="padding:30px; text-align:center; color:green; font-weight:bold; font-size:14px;">🎉 Excelente! Nenhuma ruptura pendente neste setor.</td></tr>`;
    } else {
        rupturasPendentesSetor.forEach(p => {
            let idProd = String(p.id || '').replace(/\./g, '_');
            let desc = p.descricao || p.PRODUTO || 'Produto sem descrição';
            let cod = p.codigo || p['codigo de barras'] || '-';
            let dataAud = p.dataAuditoria || '';
            let op = p.operador || '';

            linesTabela += `
                <tr style="border-bottom: 1px solid #ddd; font-size: 13px;">
                    <td style="padding: 12px;">
                        <strong>${desc}</strong><br>
                        <small style="color:#555;">Cód: ${cod}</small><br>
                        <span style="font-size:10px; color:#777;">Auditado em: ${dataAud} por ${op}</span>
                    </td>
                    <td style="padding: 12px; text-align:center; vertical-align:middle;">
                        <select id="motivo-${idProd}" style="padding: 6px; font-size:12px; width: 100%; border:1px solid #ccc; border-radius:4px;">
                            <option value="Não Informado">Definir motivo...</option>
                            <option value="Estoque Zerado">❌ Estoque Zerado</option>
                            <option value="Não Abastecido">⚠️ Não Abastecido</option>
                            <option value="Somente no Sistema">💻 No Sistema</option>
                        </select>
                    </td>
                    <td style="padding: 12px; text-align:center; vertical-align:middle; width:70px;">
                        <button onclick="salvarResolucaoRupturaNuvem('${setorFiltro}', '${idProd}')" style="background:#28a745; color:white; border:none; padding:8px 10px; font-size:12px; font-weight:bold; border-radius:4px; cursor:pointer;">✓ Ok</button>
                    </td>
                </tr>
            `;
        });
    }

    container.innerHTML = `
        <div class="topo">
            <h1>🚨 RUPTURAS: ${setorFiltro.toUpperCase()}</h1>
            <p>Painel focado exclusivamente em ações corretivas</p>
        </div>
        <div class="login" style="max-width: 100%; padding: 10px;">
            <table style="width: 100%; border-collapse: collapse; text-align: left; background:white;">
                <thead>
                    <tr style="background-color: #f2f2f2; font-size:12px; border-bottom:2px solid #ccc;">
                        <th style="padding: 10px;">Produto em Falta</th>
                        <th style="padding: 10px;">Motivo da Ocorrência</th>
                        <th style="padding: 10px; text-align:center;">Ação</th>
                    </tr>
                </thead>
                <tbody>${linesTabela}</tbody>
            </table>
            <br>
            <button onclick="abrirMenuSetoresGerente()" style="background-color: #6c757d; color: white; width: 100%;">Voltar aos Setores</button>
        </div>
    `;
}

window.salvarResolucaoRupturaNuvem = async function(setorFiltro, idItem) {
    let idFormatado = String(idItem).replace('.', '_');
    let selectElement = document.getElementById(`motivo-${idFormatado}`);
    let motivoSelecionado = selectElement ? selectElement.value : "Não Informado";

    if (motivoSelecionado === "Não Informado") {
        alert("Por favor, selecione o motivo da ocorrência antes de prosseguir.");
        return;
    }

    try {
        await fetch(`${URL_API_GAS}?acao=tratarRuptura&id=${idItem}&motivo=${encodeURIComponent(motivoSelecionado)}`, {
            method: 'POST'
        });
        alert("Ruptura tratada e salva na nuvem com sucesso!");
    } catch (e) {
        let dados = JSON.parse(localStorage.getItem("gondola_dados")) || [];
        let item = dados.find(p => String(p.id) === String(idItem));
        if (item) {
            item.tratadoRuptura = true;
            item.motivoRuptura = motivoSelecionado;
            localStorage.setItem("gondola_dados", JSON.stringify(dados));
        }
        alert("Ruptura tratada localmente!");
    }

    abrirAbaGerente(setorFiltro);
};
// ==========================================
// 13.1. FUNÇÃO DE SALVAR RESOLUÇÃO DA RUPTURA - NUVEM / GOOGLE SHEETS
// ==========================================
window.salvarResolucaoRuptura = async function(setorOrigem, idItemString) {
    let elMotivo = document.getElementById(`motivo-${idItemString.replace('.', '_')}`);
    let motivoSelecionado = elMotivo ? elMotivo.value : "Não Informado";

    if (motivoSelecionado === "Não Informado") {
        alert("Por favor, selecione o motivo da ocorrência antes de prosseguir.");
        return;
    }

    let dataAtual = new Date().toLocaleDateString();
    let horaAtual = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    let gerenteNome = typeof usuarioAtual !== 'undefined' ? usuarioAtual : "Administrador";

    // Mostra feedback visual rápido de salvamento
    document.querySelector(".container").innerHTML = `
        <div class="topo">
            <h1>🚨 RUPTURAS: ${setorOrigem.toUpperCase()}</h1>
            <p>Salvando tratativa na nuvem...</p>
        </div>
        <div class="login" style="max-width: 100%; text-align: center; padding: 20px;">
            <p style="color:#6c757d;">⏳ Gravando alteração na planilha...</p>
        </div>
    `;

    try {
        let payload = {
            acao: "salvarTratativaRuptura",
            idItem: idItemString,
            motivo: motivoSelecionado,
            gerente: gerenteNome,
            dataTratativa: dataAtual,
            horaTratativa: horaAtual
        };

        await fetch(URL_API_GAS, {
            method: 'POST',
            body: JSON.stringify(payload)
        });

        alert("✅ Tratativa gravada na nuvem com sucesso! O item sairá da lista.");
    } catch (e) {
        // Fallback local caso a rede falhe momentaneamente
        let dados = JSON.parse(localStorage.getItem("gondola_dados")) || [];
        let historicoTratativas = JSON.parse(localStorage.getItem("gondola_historico_tratativas")) || [];
        let item = dados.find(p => String(p.id) === String(idItemString));
        
        if (item) {
            item.finalizacaoGerente = motivoSelecionado;
            item.tratadoRuptura = true; 
            localStorage.setItem("gondola_dados", JSON.stringify(dados));

            historicoTratativas.push({
                idTratativa: Date.now(),
                codigo: item.codigo,
                descricao: item.descricao,
                setor: item.setor,
                operadorOrigem: item.operador,
                dataAuditoria: item.dataAuditoria,
                motivoRuptura: motivoSelecionado,
                gerenteResponsavel: gerenteNome,
                dataTratativa: dataAtual,
                horaTratativa: horaAtual
            });
            localStorage.setItem("gondola_historico_tratativas", JSON.stringify(historicoTratativas));
            alert("⚠️ Sem conexão com a nuvem. Tratativa gravada localmente!");
        } else {
            alert("Erro ao processar item.");
        }
    }
    
    abrirAbaGerente(setorOrigem);
};
// ==========================================
// 13.6. HISTÓRICO DE TRATATIVAS (CLICÁVEL POR DATA) - NUVEM / GOOGLE SHEETS
// ==========================================
async function abrirHistoricoTratativasGerente(dataFiltro = null) {
    let container = document.querySelector(".container");
    if (!container) return;

    let hojeStr = new Date().toLocaleDateString();
    let dataAlvo = hojeStr;

    if (dataFiltro) {
        let partes = dataFiltro.split("-");
        dataAlvo = `${partes[2]}/${partes[1]}/${partes[0]}`;
    }

    container.innerHTML = `
        <div class="topo">
            <h1>📋 HISTÓRICO DE TRATATIVAS</h1>
            <p>Carregando histórico da nuvem...</p>
        </div>
        <div class="login" style="max-width: 100%; text-align: center; padding: 20px;">
            <p style="color:#6c757d;">⏳ Sincronizando tratativas...</p>
        </div>
    `;

    let historico = [];
    try {
        let resposta = await fetch(`${URL_API_GAS}?acao=listarHistoricoTratativas`);
        let resultado = await resposta.json();
        if (resultado && resultado.historico) {
            historico = resultado.historico;
        }
    } catch (e) {
        historico = JSON.parse(localStorage.getItem("gondola_historico_tratativas")) || [];
    }

    let historicoFiltrado = historico.filter(t => t.dataTratativa === dataAlvo);

    let linhasHtml = "";
    if (historicoFiltrado.length === 0) {
        linhasHtml = `<p style="text-align:center; color:#777; padding:30px; background:white; border-radius:4px;">Nenhuma tratativa resolvida nesta data (${dataAlvo}).</p>`;
    } else {
        let historicoInvertido = [...historicoFiltrado].reverse(); 
        historicoInvertido.forEach(t => {
            linhasHtml += `
                <div style="background: white; border: 1px solid #dee2e6; border-radius: 6px; padding: 12px; margin-bottom: 10px; border-left: 5px solid #28a745; text-align:left;">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 6px; border-bottom: 1px solid #f8f9fa; padding-bottom:4px;">
                        <span style="font-size:11px; background:#e8f4fd; color:#0056b3; padding:2px 6px; border-radius:3px; font-weight:bold;">${t.setor}</span>
                        <span style="font-size:11px; color:#6c757d;">🛠️ Resolvido às: ${t.horaTratativa}</span>
                    </div>
                    <p style="margin:0 0 6px 0; font-size:13px; color:#222;"><strong>${t.descricao}</strong> <small style="color:#666;">(${t.codigo})</small></p>
                    <div style="font-size:11px; color:#495057; background:#f8f9fa; padding:6px; border-radius:4px; display:flex; flex-direction:column; gap:2px;">
                        <span>❌ <strong>Ruptura:</strong> ${t.motivoRuptura}</span>
                        <span>👤 <strong>Repositores:</strong> ${t.operadorOrigem} (Auditou em ${t.dataAuditoria})</span>
                    </div>
                </div>
            `;
        });
    }

    let partesInput = dataAlvo.split("/");
    let dataInputFormat = `${partesInput[2]}-${partesInput[1]}-${partesInput[0]}`;

    container.innerHTML = `
        <div class="topo">
            <h1>📋 HISTÓRICO DE TRATATIVAS</h1>
            <p>Tratativas do dia: <strong>${dataAlvo}</strong></p>
        </div>
        <div class="login" style="max-width: 100%; max-height: 70vh; overflow-y: auto; padding: 10px;">
            
            <div style="background:#e2e3e5; padding:10px; margin-bottom:15px; border-radius:4px; text-align:center;">
                <label style="font-size:12px; font-weight:bold; color:#495057; display:block; margin-bottom:5px;">📅 CLIQUE ABAIXO PARA CONSULTAR OUTRA DATA:</label>
                <input type="date" value="${dataInputFormat}" onchange="abrirHistoricoTratativasGerente(this.value)" style="padding:6px; font-size:14px; width:80%; max-width:200px; border:1px solid #ccc; border-radius:4px;">
            </div>

            <button onclick="exportarParaExcel('Historico_Tratativas_Geral', 'gondola_historico_tratativas')" style="width:100%; background:#6c757d; color:white; padding:8px; margin-bottom:15px; font-weight:bold;">📥 Exportar Todo o Histórico Mensal (Excel)</button>
            ${linhasHtml}
            <button onclick="abrirPainelAdmin()" style="background:#495057; color:white; width:100%; margin-top:15px;">⬅️ Voltar ao Painel</button>
        </div>
    `;
}

// ==========================================
// 13.7. HISTÓRICO DE LEITURA DAS MISSÕES (CLICÁVEL POR DATA) - NUVEM / GOOGLE SHEETS
// ==========================================
async function abrirHistoricoMissoesGerente(dataFiltro = null) {
    let container = document.querySelector(".container");
    if (!container) return;

    let hojeStr = new Date().toLocaleDateString();
    let dataAlvo = hojeStr;

    if (dataFiltro) {
        let partes = dataFiltro.split("-");
        dataAlvo = `${partes[2]}/${partes[1]}/${partes[0]}`;
    }

    container.innerHTML = `
        <div class="topo">
            <h1>📊 LEITURA DE MISSÕES</h1>
            <p>Carregando histórico da nuvem...</p>
        </div>
        <div class="login" style="max-width: 100%; text-align: center; padding: 20px;">
            <p style="color:#6c757d;">⏳ Sincronizando missões...</p>
        </div>
    `;

    let dados = [];
    try {
        let resposta = await fetch(`${URL_API_GAS}?acao=listarMissoes`);
        let resultado = await resposta.json();
        if (resultado && resultado.dados) {
            dados = resultado.dados;
        }
    } catch (e) {
        dados = JSON.parse(localStorage.getItem("gondola_dados")) || [];
    }

    let sessoesMapeadas = {};
    dados.forEach(item => {
        if (item.dataAuditoria === dataAlvo) {
            let id = item.idSessaoMissao || (item.dataAuditoria + "_" + item.setor); 
            if (!sessoesMapeadas[id]) {
                sessoesMapeadas[id] = {
                    idSessao: id,
                    setor: item.setor,
                    operador: item.operador || "Não Informado",
                    data: item.dataAuditoria,
                    hora: item.horaAuditoria || "--:--",
                    produtos: []
                };
            }
            sessoesMapeadas[id].produtos.push(item);
        }
    });

    let listaSessoes = Object.values(sessoesMapeadas).reverse(); 

    let linesHtml = "";
    if (listaSessoes.length === 0) {
        linesHtml = `<p style="text-align:center; color:#777; padding:20px;">Nenhuma amostragem de gôndola foi auditada em ${dataAlvo}.</p>`;
    } else {
        listaSessoes.forEach(s => {
            let total = s.produtos.length;
            let rupturas = s.produtos.filter(p => p.statusRuptura === true).length;
            let semPreco = s.produtos.filter(p => p.precificado === false).length;
            let conformes = total - rupturas;

            linesHtml += `
                <div onclick="verDetalhesMissao('${s.idSessao}')" style="background: white; border: 1px solid #dee2e6; border-radius: 6px; padding: 12px; margin-bottom: 10px; cursor: pointer; border-left: 5px solid #007bff; transition: 0.2s; text-align:left;">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 4px;">
                        <strong style="color: #333; font-size:14px;">${s.setor}</strong>
                        <span style="font-size:11px; color:#6c757d;">Horário: ${s.hora}</span>
                    </div>
                    <div style="font-size:12px; color:#495057; display:flex; justify-content:space-between;">
                        <span>👤 Op: ${s.operador}</span>
                        <span>🟢 ${conformes} | 🔴 Rup: ${rupturas} | 🏷️ Etq: ${semPreco}</span>
                    </div>
                </div>
            `;
        });
    }

    let partesInput = dataAlvo.split("/");
    let dataInputFormat = `${partesInput[2]}-${partesInput[1]}-${partesInput[0]}`;

    container.innerHTML = `
        <div class="topo">
            <h1>📊 LEITURA DE MISSÕES</h1>
            <p>Missões do dia: <strong>${dataAlvo}</strong></p>
        </div>
        <div class="login" style="max-width: 100%; max-height: 70vh; overflow-y: auto; padding: 10px;">
            
            <div style="background:#e2e3e5; padding:10px; margin-bottom:15px; border-radius:4px; text-align:center;">
                <label style="font-size:12px; font-weight:bold; color:#495057; display:block; margin-bottom:5px;">📅 CLIQUE ABAIXO PARA CONSULTAR OUTRA DATA:</label>
                <input type="date" value="${dataInputFormat}" onchange="abrirHistoricoMissoesGerente(this.value)" style="padding:6px; font-size:14px; width:80%; max-width:200px; border:1px solid #ccc; border-radius:4px;">
            </div>

            <button onclick="exportarParaExcel('Historico_Geral_Missoes', 'gondola_dados')" style="width:100%; background:#6c757d; color:white; padding:8px; margin-bottom:15px; font-weight:bold;">📥 Exportar Toda a Base Histórica (Excel)</button>
            ${linesHtml}
            <button onclick="abrirPainelAdmin()" style="background:#495057; color:white; width:100%; margin-top:15px;">⬅️ Voltar ao Painel</button>
        </div>
    `;
}

// ==========================================
// 13.8. DETALHES DA MISSÃO - NUVEM / GOOGLE SHEETS
// ==========================================
window.verDetalhesMissao = async function(idSessao) {
    let container = document.querySelector(".container");
    if (!container) return;

    container.innerHTML = `
        <div class="topo">
            <h1>📋 DETALHES DA MISSÃO</h1>
            <p>Carregando detalhes da nuvem...</p>
        </div>
        <div class="login" style="max-width: 100%; text-align: center; padding: 20px;">
            <p style="color:#6c757d;">⏳ Buscando dados da missão...</p>
        </div>
    `;

    let dados = [];
    try {
        let resposta = await fetch(`${URL_API_GAS}?acao=listarMissoes`);
        let resultado = await resposta.json();
        if (resultado && resultado.dados) {
            dados = resultado.dados;
        }
    } catch (e) {
        dados = JSON.parse(localStorage.getItem("gondola_dados")) || [];
    }

    let produtosSessao = dados.filter(p => (p.idSessaoMissao == idSessao || (p.dataAuditoria + "_" + p.setor) == idSessao));
    
    if (produtosSessao.length === 0) {
        alert("Nenhum produto encontrado para esta sessão.");
        abrirHistoricoMissoesGerente();
        return;
    }

    let infoBase = produtosSessao[0];
    let itensHtml = "";

    produtosSessao.forEach((p, index) => {
        let absBadge = p.abastecido ? `<span style="color:green; font-weight:bold;">🟢 Abastecido</span>` : `<span style="color:red; font-weight:bold;">🔴 RUPTURA</span>`;
        let prcBadge = p.precificado === true ? `| Preço: <span style="color:green;">🟢 OK</span>` : (p.precificado === false ? `| Preço: <span style="color:red; font-weight:bold;">🔴 SEM ETIQUETA</span>` : `| Preço: <span style="color:gray;">⚠️ N/A</span>`);
        let tratativa = p.finalizacaoGerente ? `<br><span style="color:#28a745; font-size:11px;">🛠️ Solução: <strong>${p.finalizacaoGerente}</strong></span>` : "";

        itensHtml += `
            <div style="padding: 10px 0; border-bottom: 1px solid #eee; font-size: 13px;">
                <p style="margin: 0 0 5px 0;"><strong>${index + 1}. ${p.descricao}</strong> <small style="color:#777;">(${p.codigo})</small></p>
                <div style="background:#f8f9fa; padding:6px; border-radius:4px; font-size:12px;">
                    ${absBadge} ${prcBadge}
                    ${tratativa}
                </div>
            </div>
        `;
    });

    container.innerHTML = `
        <div class="topo">
            <h1>📋 DETALHES DA MISSÃO</h1>
            <p>${infoBase.setor}</p>
        </div>
        <div class="login" style="max-width: 100%; max-height: 70vh; overflow-y: auto; text-align:left; padding: 15px;">
            <div style="background:#e9ecef; padding:8px; border-radius:4px; font-size:12px; margin-bottom:15px; color:#495057;">
                👤 <strong>Operador:</strong> ${infoBase.operador || "Não Informado"}<br>
                📅 <strong>Data:</strong> ${infoBase.dataAuditoria} às ${infoBase.horaAuditoria || "--:--"}<br>
            </div>
            ${itensHtml}
            <button onclick="abrirHistoricoMissoesGerente()" style="background:#6c757d; color:white; width:100%; margin-top:20px;">⬅️ Voltar ao Histórico</button>
        </div>
    `;
};
// ==========================================
// 17. GRAVAÇÃO DAS RESPOSTAS DO CHECKLIST - NUVEM / GOOGLE SHEETS
// ==========================================
async function salvarRespostasChecklist(nomeSetor) {
    let dataAtual = new Date().toLocaleDateString();
    let horaAtual = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    let usuarioLogado = typeof usuarioAtual !== 'undefined' ? usuarioAtual : "Administrador";
    let sessaoId = Date.now();

    let novasRespostas = [];
    if (typeof perguntasAtivasChecklist !== 'undefined') {
        perguntasAtivasChecklist.forEach(p => {
            let elResposta = document.getElementById(`resp-checklist-${p.id}`);
            let elObservacao = document.getElementById(`obs-checklist-${p.id}`);
            if (elResposta) {
                novasRespostas.push({
                    perguntaId: p.id,
                    perguntaTexto: p.pergunta,
                    resposta: elResposta.value,
                    observacao: elObservacao ? elObservacao.value.trim() : ""
                });
            }
        });
    }

    if (novasRespostas.length === 0) {
        alert("Nenhuma resposta coletada.");
        return;
    }

    let payloadChecklist = {
        idSessao: sessaoId,
        setor: nomeSetor,
        usuario: usuarioLogado,
        data: dataAtual,
        hora: horaAtual,
        itensRespondidos: novasRespostas
    };

    // Salva localmente como backup/fallback imediato
    let historicoChecklists = JSON.parse(localStorage.getItem("gondola_historico_checklists")) || [];
    historicoChecklists.push(payloadChecklist);
    localStorage.setItem("gondola_historico_checklists", JSON.stringify(historicoChecklists));

    // Envio para a nuvem (Google Sheets via Apps Script)
    try {
        if (typeof URL_API_GAS !== 'undefined' && URL_API_GAS) {
            await fetch(URL_API_GAS, {
                method: "POST",
                mode: "no-cors",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    acao: "salvarChecklist",
                    ...payloadChecklist
                })
            });
        }
    } catch (e) {
        console.warn("Erro ao sincronizar checklist com a nuvem, salvo apenas localmente.", e);
    }

    alert(`✅ Checklist do setor "${nomeSetor}" gravado com sucesso!`);
    abrirMenuChecklistsGerente();
}

// ==========================================
// 18. HISTÓRICO DE CHECKLISTS - NUVEM / GOOGLE SHEETS
// ==========================================
async function abrirHistoricoChecklistsGerente(dataFiltro = null) {
    let container = document.querySelector(".container");
    if (!container) return;

    let dataSelecionada = new Date().toLocaleDateString();

    if (dataFiltro) {
        let p = dataFiltro.split("-");
        dataSelecionada = `${p[2]}/${p[1]}/${p[0]}`;
    }

    container.innerHTML = `
        <div class="topo"><h1>📋 HISTÓRICO DE CHECKLISTS</h1></div>
        <div class="login" style="max-width: 100%; text-align: center; padding: 20px;">
            <p style="color:#6c757d;">⏳ Sincronizando histórico da nuvem...</p>
        </div>
    `;

    let historico = [];
    try {
        if (typeof URL_API_GAS !== 'undefined' && URL_API_GAS) {
            let resposta = await fetch(`${URL_API_GAS}?acao=listarHistoricoChecklists`);
            let resultado = await resposta.json();
            if (resultado && resultado.historico) {
                historico = resultado.historico;
            }
        } else {
            throw new Error("URL_API_GAS não configurada");
        }
    } catch (e) {
        historico = JSON.parse(localStorage.getItem("gondola_historico_checklists")) || [];
    }

    let lista = historico.filter(item => item.data === dataSelecionada).sort((a,b) => b.idSessao - a.idSessao);
    let html = lista.length === 0 ? '<div style="padding:25px; text-align:center; color:#666; background:white; border-radius:4px; margin-bottom:15px;">Nenhum checklist encontrado nesta data.</div>' : "";

    lista.forEach(sessao => {
        let itens = sessao.itensRespondidos || [];
        let ok = itens.filter(i => i.resposta === "OK").length;
        let nc = itens.filter(i => i.resposta === "NAO_CONFORME" || i.resposta === "NÃO CONFORME").length;
        
        html += `
            <div onclick="verDetalhesChecklist('${sessao.idSessao}')" style="background:white; border-left:5px solid #6f42c1; padding:12px; margin-bottom:10px; border-radius:6px; cursor:pointer; text-align:left; border:1px solid #dee2e6; border-left-width:5px;">
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <strong style="color:#333; font-size:14px;">${sessao.setor}</strong>
                    <small style="color:#6c757d;">🕒 ${sessao.hora || "--:--"}</small>
                </div>
                <small style="color:#495057; display:block; margin-top:2px;">👤 Responsável: ${sessao.usuario}</small>
                <hr style="margin:8px 0; border:0; border-top:1px solid #f1f1f1;">
                <div style="font-size:12px; font-weight:bold;">
                    🟢 OK: ${ok} &nbsp;&nbsp; 🔴 Não Conforme: ${nc} &nbsp;&nbsp; 📋 Total: ${itens.length}
                </div>
            </div>
        `;
    });

    let d = dataSelecionada.split("/");
    let inputDateVal = `${d[2]}-${d[1]}-${d[0]}`;

    container.innerHTML = `
        <div class="topo"><h1>📋 HISTÓRICO DE CHECKLISTS</h1></div>
        <div class="login" style="max-width: 100%; max-height: 75vh; overflow-y: auto; padding: 10px;">
            <div style="background:#e2e3e5; padding:10px; margin-bottom:15px; border-radius:4px; text-align:center;">
                <label style="font-size:12px; font-weight:bold; color:#495057; display:block; margin-bottom:5px;">📅 SELECIONE A DATA DE CONSULTA:</label>
                <input type="date" value="${inputDateVal}" onchange="abrirHistoricoChecklistsGerente(this.value)" style="padding:6px; font-size:14px; width:80%; max-width:200px; border:1px solid #ccc; border-radius:4px;">
            </div>
            <button onclick="exportarParaExcel('Historico_Checklists','gondola_historico_checklists')" style="width:100%; background:#6c757d; color:white; padding:8px; margin-bottom:15px; font-weight:bold;">📥 Exportar Excel</button>
            ${html}
            <button onclick="typeof usuarioAtual !== 'undefined' && usuarioAtual === 'Administrador' ? abrirPainelAdmin() : voltarMenuPrincipal()" style="background:#495057; color:white; width:100%; margin-top:15px;">⬅️ Voltar</button>
        </div>
    `;
}

// ==========================================
// 19. DETALHES DO CHECKLIST - NUVEM / GOOGLE SHEETS
// ==========================================
window.verDetalhesChecklist = async function(idSessao) {
    let container = document.querySelector(".container");
    if (!container) return;

    container.innerHTML = `
        <div class="topo"><h1>📋 DETALHES DO CHECKLIST</h1></div>
        <div class="login" style="max-width: 100%; text-align: center; padding: 20px;">
            <p style="color:#6c757d;">⏳ Buscando dados do checklist...</p>
        </div>
    `;

    let historico = [];
    try {
        if (typeof URL_API_GAS !== 'undefined' && URL_API_GAS) {
            let resposta = await fetch(`${URL_API_GAS}?acao=listarHistoricoChecklists`);
            let resultado = await resposta.json();
            if (resultado && resultado.historico) {
                historico = resultado.historico;
            }
        } else {
            throw new Error("URL_API_GAS não configurada");
        }
    } catch (e) {
        historico = JSON.parse(localStorage.getItem("gondola_historico_checklists")) || [];
    }

    let sessao = historico.find(s => String(s.idSessao) === String(idSessao));
    if (!sessao) {
        alert("Checklist não encontrado.");
        abrirHistoricoChecklistsGerente();
        return;
    }

    let itensHtml = (sessao.itensRespondidos || []).map((item, index) => {
        let isOk = item.resposta === "OK";
        let statusBadge = isOk 
            ? `<span style="color:#28a745; font-weight:bold;">🟢 OK</span>` 
            : `<span style="color:#dc3545; font-weight:bold;">🔴 NÃO CONFORME</span>`;

        return `
            <div style="padding:10px; border-bottom:1px solid #eee; text-align:left; font-size:13px;">
                <p style="margin:0 0 5px 0;"><strong>${index + 1}. ${item.perguntaTexto}</strong></p>
                <div style="background:#f8f9fa; padding:6px; border-radius:4px; font-size:12px;">
                    Status: ${statusBadge}
                    ${item.observacao ? `<br><span style="color:#555;">💬 <strong>Obs:</strong> ${item.observacao}</span>` : ""}
                </div>
            </div>
        `;
    }).join("");

    container.innerHTML = `
        <div class="topo"><h1>${sessao.setor}</h1></div>
        <div class="login" style="max-width: 100%; max-height: 75vh; overflow-y: auto; padding: 15px;">
            <div style="background:#e9ecef; padding:8px; border-radius:4px; font-size:12px; margin-bottom:15px; text-align:left; color:#495057;">
                👤 <strong>Responsável:</strong> ${sessao.usuario}<br>
                📅 <strong>Data:</strong> ${sessao.data} às ${sessao.hora || "--:--"}
            </div>
            ${itensHtml}
            <button onclick="abrirHistoricoChecklistsGerente()" style="background:#6c757d; color:white; width:100%; margin-top:20px;">⬅️ Voltar ao Histórico</button>
        </div>
    `;
};

// ==========================================================
// FUNÇÕES DO CICLO EVOLUTIVO DE CHECKLIST (1 A 6 DIAS) - SUPABASE
// ==========================================================
let indiceMissaoAtual = 0;
let perguntasMissao = [];

async function abrirMenuChecklistsGerente() {
    // Controle do Ciclo de Dias (1 a 6) no dispositivo
    let diaDoCiclo = parseInt(localStorage.getItem("gondola_ciclo_checklist_dia")) || 1;

    // ==========================================
    // REGRA DO 6º DIA: DIA DA GESTÃO OPERACIONAL
    // ==========================================
    if (diaDoCiclo >= 6) {
        renderizarDiaDaGestao();
        return;
    }

    let perguntas = [];
    
    // Busca perguntas configuradas diretamente do Supabase na tabela check_list
    if (supabaseClient) {
        let { data, error } = await supabaseClient
            .from('check_list')
            .select('*');

        if (!error && data) {
            perguntas = data;
        }
    }

    if (perguntas.length === 0) {
        alert("⚠️ Nenhuma pergunta de checklist encontrada na tabela 'check_list' do Supabase!");
        return;
    }

    // ==========================================
    // REGRA DO 5º DIA: CHECKLIST GLOBAL (TODAS)
    // ==========================================
    if (diaDoCiclo === 5) {
        alert("📢 DIA DO CHECKLIST GLOBAL: Hoje a auditoria será COMPLETA para preparar o diagnóstico da loja!");
        perguntas.sort(() => Math.random() - 0.5);
    } 
    // ==========================================
    // REGRA DO 1º AO 4º DIA: ROTINA AMOSTRAL (15)
    // ==========================================
    else {
        perguntas.sort(() => Math.random() - 0.5);
        if (perguntas.length > 15) {
            perguntas = perguntas.slice(0, 15);
        }
    }

    // Organiza por setor para otimizar o deslocamento na loja
    perguntas.sort((a, b) => {
        let setorA = a.setor || "";
        let setorB = b.setor || "";
        return setorA.localeCompare(setorB);
    });

    perguntasMissao = perguntas;
    indiceMissaoAtual = 0;

    renderizarPerguntaDoChecklist();
}

// --- TELA EXCLUSIVA DO 6º DIA (APÓS O GLOBAL) ---
function renderizarDiaDaGestao() {
    let container = document.querySelector(".container");
    if (!container) return;

    container.innerHTML = `
        <div class="topo" style="background:#4b13b3;">
            <h1>📊 DIA DA GESTÃO OPERACIONAL</h1>
            <p>Foco Estratégico e Auditoria de Indicadores</p>
        </div>

        <div style="padding: 15px; text-align: center;">
            <div style="background: #f3f0ff; border-left: 5px solid #6f42c1; padding: 15px; border-radius: 6px; text-align: left; margin-bottom: 20px;">
                <h3 style="color: #4b13b3; margin-top: 0; font-size: 16px;">🎯 Diagnóstico Estratégico da Loja:</h3>
                <p style="font-size: 14px; color: #333; line-height: 1.5; margin: 5px 0;">
                    Hoje é o <strong>Dia da Gestão</strong>. Com base no Checklist Global realizado ontem, utilize este turno para:
                </p>
                <ul style="font-size: 13px; color: #444; padding-left: 20px; line-height: 1.6;">
                    <li>Analise o comportamento da loja/missões e veja quais as pendências acumuladas.</li>
                    <li>Mapeie os gargalos operacionais e defina os planos de ação com os encarregados.</li>
                    <li>Monitore os relatórios de ruptura para ajustar a reposição.</li>
                </ul>
            </div>

            <button onclick="salvarDiaDaGestaoNoHist()" style="width:100%; padding:16px; background:#6f42c1; color:white; border:none; border-radius:6px; font-size:16px; font-weight:bold; cursor:pointer;">
                ✅ Concluir Análise de Gestão
            </button>

            <button onclick="abrirPainelAdmin()" style="width:100%; padding:12px; background:#6c757d; color:white; border:none; border-radius:6px; font-size:14px; margin-top: 15px; cursor:pointer;">
                ↩ Voltar ao Menu
            </button>
        </div>
    `;
}

function renderizarPerguntaDoChecklist() {
    let container = document.querySelector(".container");
    if (!container) return;

    let p = perguntasMissao[indiceMissaoAtual];
    let diaDoCiclo = parseInt(localStorage.getItem("gondola_ciclo_checklist_dia")) || 1;
    
    let tituloTopo = diaDoCiclo === 5 ? "📢 CHECKLIST GLOBAL" : "📋 CHECKLIST OPERACIONAL";
    let subTitulo = diaDoCiclo === 5 ? "Auditoria Integral de Preparação" : `Auditoria Amostral - Dia ${diaDoCiclo} de 4`;
    let corTopo = diaDoCiclo === 5 ? "#e67e22" : "#6f42c1";

    let textoPergunta = p.pergunta || p.perguntaTexto || "Pergunta sem texto";
    let setorPergunta = p.setor || "Geral";

    container.innerHTML = `
        <div class="topo" style="background:${corTopo};">
            <h1>${tituloTopo}</h1>
            <p>${subTitulo}</p>
        </div>

        <div style="text-align:center;padding:10px;">
            <p style="font-size:11px;color:#666;margin-bottom:5px;">
                Item ${indiceMissaoAtual + 1} de ${perguntasMissao.length}
            </p>
            <p style="font-size:13px;font-weight:bold;color:${corTopo};margin-bottom:20px;text-transform:uppercase;">
                📍 Setor: ${setorPergunta}
            </p>
            <div style="font-size:17px;font-weight:bold;margin-bottom:25px;min-height:60px;display:flex;align-items:center;justify-content:center;line-height:1.4;color:#333;">
                "${textoPergunta}"
            </div>

            <button onclick="salvarRespostaPasso('SIM')" style="width:100%;padding:16px;background:#28a745;color:white;border:none;border-radius:6px;margin-bottom:12px;font-size:16px;font-weight:bold;cursor:pointer;">
                🟢 SIM (CONFORME)
            </button>
            <button onclick="salvarRespostaPasso('NÃO')" style="width:100%;padding:16px;background:#dc3545;color:white;border:none;border-radius:6px;margin-bottom:12px;font-size:16px;font-weight:bold;cursor:pointer;">
                🔴 NÃO CONFORME
            </button>
            <button onclick="abrirPainelAdmin()" style="width:100%;padding:12px;background:#6c757d;color:white;border:none;border-radius:6px;font-size:14px;margin-top:15px;cursor:pointer;">
                ↩ Cancelar e Sair
            </button>
        </div>
    `;
}

async function salvarRespostaPasso(resposta) {
    let perguntaAtual = perguntasMissao[indiceMissaoAtual];
    let respostas = JSON.parse(localStorage.getItem("gondola_respostas_checklist_atual")) || [];

    respostas.push({
        perguntaTexto: perguntaAtual.pergunta || perguntaAtual.perguntaTexto,
        setor: perguntaAtual.setor || "Geral",
        resposta: resposta === "SIM" ? "OK" : "NAO_CONFORME",
        observacao: ""
    });

    localStorage.setItem("gondola_respostas_checklist_atual", JSON.stringify(respostas));
    indiceMissaoAtual++;

    if (indiceMissaoAtual < perguntasMissao.length) {
        renderizarPerguntaDoChecklist();
        return;
    }

    // FINALIZAÇÃO DE RESPOSTAS (DIAS 1 A 5)
    let itensRespondidos = JSON.parse(localStorage.getItem("gondola_respostas_checklist_atual")) || [];
    let conformes = itensRespondidos.filter(i => i.resposta === "OK").length;
    let percentual = Math.round((conformes / itensRespondidos.length) * 100);

    let diaDoCiclo = parseInt(localStorage.getItem("gondola_ciclo_checklist_dia")) || 1;

    let novoChecklist = {
        setor: "Checklist Operacional",
        tipoMissao: diaDoCiclo === 5 ? "GLOBAL" : "ROTINA",
        usuario: usuarioAtual || "Administrador",
        data: new Date().toLocaleDateString("pt-BR"),
        hora: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        nota: percentual,
        totalPerguntas: itensRespondidos.length,
        conformes: conformes,
        itensRespondidos: JSON.stringify(itensRespondidos)
    };

    // Envio direto para a tabela check_list no Supabase
    if (supabaseClient) {
        let { error } = await supabaseClient
            .from('check_list')
            .insert([novoChecklist]);

        if (error) {
            console.error("Erro ao salvar checklist no Supabase:", error.message);
        }
    }

    localStorage.removeItem("gondola_respostas_checklist_atual");
    localStorage.setItem("gondola_ciclo_checklist_dia", diaDoCiclo + 1);

    alert(`✅ Checklist gravado no Supabase com sucesso!\n\nÍndice de Conformidade: ${percentual}%`);
    abrirPainelAdmin();
}

// --- CONCLUSÃO AUTOMÁTICA DO DIA DA GESTÃO ---
async function salvarDiaDaGestaoNoHist() {
    let analiseGestao = {
        setor: "Checklist Operacional",
        tipoMissao: "DIA_GESTAO",
        usuario: usuarioAtual || "Administrador",
        data: new Date().toLocaleDateString("pt-BR"),
        hora: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        nota: 100,
        totalPerguntas: 1,
        conformes: 1,
        itensRespondidos: JSON.stringify([{
            perguntaTexto: "Hoje é o dia da gestão, analise o comportamento da loja/missões, veja quais as pendencias.",
            setor: "Estratégico",
            resposta: "OK",
            observacao: "Auditoria analítica realizada pós-global"
        }])
    };

    if (supabaseClient) {
        let { error } = await supabaseClient
            .from('check_list')
            .insert([analiseGestao]);

        if (error) {
            console.error("Erro ao salvar Dia da Gestão no Supabase:", error.message);
        }
    }

    // Finalizou o 6º dia, reseta o ciclo para o Dia 1
    localStorage.setItem("gondola_ciclo_checklist_dia", 1);

    alert("📊 Relatório de Análise da Gestão enviado ao Supabase! Ciclo reiniciado.");
    abrirPainelAdmin();
}

// ==========================================================
// SERVIÇO: COLETOR DE ETIQUETAS AVULSO + SUPABASE
// ==========================================================
let scannerColetorAtivo = null;
let produtoColetorSelecionado = null;

function abrirColetorEtiquetas() {
    let container = document.querySelector(".container");
    if (!container) return;

    container.innerHTML = `
        <div class="topo" style="background:#f0ad4e;">
            <h1>🏷️ COLETOR DE ETIQUETAS</h1>
            <p>Busca Direta no Cadastro Global do Supabase</p>
        </div>

        <div style="padding:20px;">
            <div id="reader_coletor" style="width:100%; border-radius:8px; overflow:hidden; margin-bottom:15px;"></div>

            <div style="display:flex; gap:8px; margin-bottom:15px;">
                <button onclick="ligarCameraColetor()" 
                style="flex:1;padding:12px;background:#007bff;color:white;border:0;border-radius:6px;font-weight:bold;">
                📷 Abrir Câmera
                </button>

                <button onclick="fecharCameraColetor()" 
                style="flex:1;padding:12px;background:#dc3545;color:white;border:0;border-radius:6px;font-weight:bold;">
                🛑 Fechar
                </button>
            </div>

            <label style="font-weight:bold;">
            Código de Barras ou Nome:
            </label>

            <input id="input_coletor_etiqueta"
            placeholder="Bipe ou digite o item..."
            style="width:100%;padding:15px;margin:8px 0 15px;font-size:16px;box-sizing:border-box;">

            <button onclick="buscarProdutoNaBaseGlobal()"
            style="width:100%;padding:16px;background:#28a745;color:white;border:0;border-radius:6px;font-weight:bold;">
            🔍 VERIFICAR PRODUTO
            </button>

            <div id="resultado_busca_coletor" style="margin-top:20px;"></div>

            <button onclick="fecharCameraColetor(); voltarMenuPrincipal();"
            style="width:100%;padding:12px;background:#6c757d;color:white;border:0;border-radius:6px;margin-top:20px;">
            ↩ Voltar
            </button>
        </div>
    `;

    setTimeout(() => {
        document.getElementById("input_coletor_etiqueta")?.focus();
    }, 100);
}

function ligarCameraColetor() {
    fecharCameraColetor();

    scannerColetorAtivo = new Html5QrcodeScanner(
        "reader_coletor",
        {
            fps: 10,
            qrbox: { width: 250, height: 150 }
        }
    );

    scannerColetorAtivo.render((codigo) => {
        let input = document.getElementById("input_coletor_etiqueta");
        if (input) {
            input.value = codigo;
            fecharCameraColetor();
            buscarProdutoNaBaseGlobal();
        }
    }, () => {});
}

function fecharCameraColetor() {
    if (scannerColetorAtivo) {
        try { scannerColetorAtivo.clear(); } catch(e) {}
        scannerColetorAtivo = null;
    }

    let div = document.getElementById("reader_coletor");
    if (div) div.innerHTML = "";
}

async function buscarProdutoNaBaseGlobal() {
    let input = document.getElementById("input_coletor_etiqueta");
    let resultado = document.getElementById("resultado_busca_coletor");

    if (!input || !resultado) return;

    let termo = input.value.trim();

    if (!termo) {
        alert("Digite ou bipe um produto!");
        return;
    }

    resultado.innerHTML = `<p style="text-align:center; color:#6c757d;">🔍 Consultando cadastro global no Supabase...</p>`;

    // Utiliza a função centralizada de busca no cadastro_global do Supabase
    let produtos = await buscarProdutoCadastroGlobal(termo);

    if (produtos && produtos.length > 0) {
        let encontrado = produtos[0];
        let nome = encontrado.PRODUTO || encontrado.descricao || termo;
        let cod = encontrado['CODIGO DE BARRAS'] || encontrado.codigo || termo;
        let setor = encontrado.setor || "Geral";

        produtoColetorSelecionado = {
            codigo: cod,
            nome: nome,
            setor: setor
        };

        resultado.innerHTML = `
        <div style="background:#d4edda;padding:15px;border-radius:6px;text-align:left;">
            <strong>✅ PRODUTO ENCONTRADO NO SUPABASE</strong>
            <p style="font-weight:bold;font-size:16px;margin:5px 0;">${nome}</p>
            <small>📍 Setor: ${setor} | Cód: ${cod}</small>
        </div>
        <button onclick="confirmarEGravarEtiquetaPendente()"
        style="width:100%;padding:16px;background:#28a745;color:white;border:0;border-radius:6px;margin-top:15px;font-weight:bold;cursor:pointer;">
        💾 Confirmar e Gerar Etiqueta
        </button>
        `;
    } else {
        produtoColetorSelecionado = {
            codigo: termo,
            nome: termo,
            setor: "Coleta Avulsa"
        };

        resultado.innerHTML = `
        <div style="background:#fff3cd;padding:15px;border-radius:6px;text-align:left;">
            ⚠️ Produto não localizado no Cadastro Global.
            <br><br>
            Será gerado como: <b>${termo}</b>
        </div>
        <button onclick="confirmarEGravarEtiquetaPendente()"
        style="width:100%;padding:16px;background:#ffc107;border:0;border-radius:6px;margin-top:15px;font-weight:bold;cursor:pointer;">
        ⚠️ Confirmar Etiqueta Avulsa
        </button>
        `;
    }
}

async function confirmarEGravarEtiquetaPendente() {
    if (!produtoColetorSelecionado) {
        alert("Nenhum produto selecionado!");
        return;
    }

    let loja = localStorage.getItem("lojaAtual") || "Geral";
    
    // Grava diretamente na tabela etiquetas_pendentes do Supabase
    let sucesso = await salvarEtiquetaPendente(
        produtoColetorSelecionado.codigo,
        produtoColetorSelecionado.nome,
        loja,
        produtoColetorSelecionado.setor
    );

    if (sucesso) {
        alert("✅ Etiqueta pendente enviada para o Supabase:\n\n" + produtoColetorSelecionado.nome);
    }

    produtoColetorSelecionado = null;

    let campo = document.getElementById("input_coletor_etiqueta");
    if (campo) {
        campo.value = "";
        campo.focus();
    }

    let resultado = document.getElementById("resultado_busca_coletor");
    if (resultado) resultado.innerHTML = "";
}

// ==========================================================
// IMPORTAÇÃO DE RUAS E ROTAS (ENDEREÇOS VIA SUPABASE)
// ==========================================================
async function processarArquivoCSVRotas(elementoInput) {
    let arquivo = elementoInput.files[0];
    if (!arquivo) return;

    let leitor = new FileReader();
    leitor.onload = async function(e) {
        try {
            let texto = e.target.result;
            let linhas = texto.split("\n");
            let resultado = [];

            for (let i = 1; i < linhas.length; i++) {
                let linhaLimpa = linhas[i].trim();
                if (!linhaLimpa) continue;

                let colunas = linhaLimpa.split(";");
                let nomeRua = colunas[2] ? colunas[2].trim().toUpperCase() : "";
                
                if (nomeRua === "" || nomeRua === "NOME") continue;

                resultado.push({
                    cidade: colunas[0] ? colunas[0].trim().toUpperCase() : "",
                    bairro: colunas[1] ? colunas[1].trim().toUpperCase() : "",
                    rua: nomeRua,
                    rota: colunas[3] ? colunas[3].trim().replace("\r", "") : "1"
                });
            }

            if (supabaseClient && resultado.length > 0) {
                const { error } = await supabaseClient
                    .from('enderecos')
                    .insert(resultado);

                if (error) {
                    console.error("Erro ao salvar base de endereços no Supabase:", error.message);
                    alert("Erro ao sincronizar endereços no Supabase.");
                    return;
                }
            }

            alert("✅ Base de endereços e rotas sincronizada no Supabase! " + resultado.length + " ruas cadastradas.");
            if (typeof abrirPainelAdmin === "function") abrirPainelAdmin();

        } catch (err) {
            console.error(err);
            alert("❌ Erro ao processar o arquivo CSV.");
        }
    };
    leitor.readAsText(arquivo, "UTF-8");
}

let entregaEmEdicao = {
    cliente: "", cidade: "", bairro: "", rua: "", numero: "", apartamento: "Não", aptoDetalhe: "", caixas: 1, gelados: "Não", rota: "1"
};

// ==========================================
// LANÇAMENTO DE ENTREGAS (FISCAL DE CAIXA)
// ==========================================
async function abrirAbaLancamentoEntrega() {
    let container = document.querySelector(".container");
    if (!container) return;

    entregaEmEdicao = { cliente: "", cidade: "", bairro: "", rua: "", numero: "", apartamento: "Não", aptoDetalhe: "", caixas: 1, gelados: "Não", rota: "1" };

    container.innerHTML = `
        <div class="topo" style="background:#0275d8;">
            <h1>📦 LANÇAMENTO DE ENTREGAS</h1>
            <p>Fluxo Direto Conectado ao Supabase</p>
        </div>

        <div style="padding: 20px; text-align: left;">
            <div id="bloco_passo1" style="margin-bottom: 15px;">
                <label style="font-weight:bold; font-size:14px; color:#333;">Nome do Cliente:</label>
                <input type="text" id="ent_nome_cliente" placeholder="Digite o nome do cliente..." oninput="buscarClienteCadastro(this.value)"
                style="width:100%; padding:14px; border:1px solid #ccc; border-radius:6px; box-sizing:border-box; font-size:16px; margin-top:5px; text-transform: uppercase;">
                <div id="sugestoes_clientes" style="background:white; border-radius:0 0 6px 6px; max-height:150px; overflow-y:auto;"></div>
            </div>

            <div id="painel_cascata_botoes"></div>

            <div id="formulario_final_entrega" style="display:none; background:#f8f9fa; padding:15px; border-radius:8px; border:1px solid #ddd; margin-top:15px;">
                
                <div style="margin-bottom: 12px;">
                    <label style="font-weight:bold; font-size:13px;">Número da Residência:</label>
                    <input type="text" id="ent_numero" placeholder="Ex: 150 ou S/N" style="width:100%; padding:10px; border:1px solid #ccc; border-radius:4px; font-size:15px; margin-top:5px;">
                </div>

                <div style="margin-bottom: 12px;">
                    <label style="font-weight:bold; font-size:13px;">É Apartamento / Bloco?</label>
                    <select id="ent_apto" onchange="toggleCampoApartamento(this.value)" style="width:100%; padding:10px; border:1px solid #ccc; border-radius:4px; font-size:15px; margin-top:5px;">
                        <option value="Não">Não</option>
                        <option value="Sim">Sim</option>
                    </select>
                </div>

                <div id="bloco_detalhe_apto" style="display:none; margin-bottom: 12px;">
                    <label style="font-weight:bold; font-size:13px; color:#d9534f;">Detalhes do Apartamento:</label>
                    <input type="text" id="ent_apto_detalhe" placeholder="Ex: Apto 302, Bloco B" style="width:100%; padding:10px; border:1px solid #ccc; border-radius:4px; font-size:15px; margin-top:5px;">
                </div>

                <div style="margin-bottom: 12px;">
                    <label style="font-weight:bold; font-size:13px;">Quantidade de Caixas / Volumes:</label>
                    <input type="number" id="ent_caixas" value="1" min="1" style="width:100%; padding:10px; border:1px solid #ccc; border-radius:4px; font-size:15px; margin-top:5px;">
                </div>

                <div style="margin-bottom: 15px;">
                    <label style="font-weight:bold; font-size:13px; color:#0275d8;">❄️ Contém Itens Gelados / Congelados?</label>
                    <select id="ent_gelados" style="width:100%; padding:10px; border:1px solid #0275d8; border-radius:4px; font-size:15px; margin-top:5px; font-weight:bold; color:#0275d8;">
                        <option value="Não">Não</option>
                        <option value="Sim">❄️ SIM (Prioridade Máxima)</option>
                    </select>
                </div>

                <button onclick="salvarNovaEntrega()" style="width:100%; padding:16px; background:#28a745; color:white; border:none; border-radius:6px; font-weight:bold; font-size:16px; cursor:pointer;">
                    💾 SALVAR E GERAR TICKET
                </button>
            </div>

            <button onclick="voltarMenuPrincipal()" style="width:100%; padding:12px; background:#6c757d; color:white; border:none; border-radius:6px; margin-top:20px; cursor:pointer; font-weight:bold;">
                ↩ Voltar ao Menu
            </button>
        </div>
    `;

    renderizarBotoesCidade();
}

async function buscarClienteCadastro(nomeDigitado) {
    let termo = nomeDigitado.trim().toUpperCase();
    let divSugestoes = document.getElementById("sugestoes_clientes");
    if (!divSugestoes) return;

    if (termo.length < 2) {
        divSugestoes.innerHTML = "";
        return;
    }

    if (!supabaseClient) return;

    let { data } = await supabaseClient
        .from('entregas')
        .select('*')
        .ilike('cliente', `%${termo}%`)
        .limit(5);

    if (!data || data.length === 0) {
        divSugestoes.innerHTML = `<div style="padding:10px; color:#888; font-size:13px;">🆕 Cliente novo. Prossiga abaixo.</div>`;
        entregaEmEdicao.cliente = termo;
        return;
    }

    divSugestoes.innerHTML = data.map(c => `
        <div onclick="aplicarClienteCadastrado('${c.cliente}', '${c.cidade \vert{}\vert{} ''}', '${c.bairro || ''}', '${c.rua \vert{}\vert{} ''}', '${c.numero || ''}', '${c.apartamento \vert{}\vert{} 'Não'}', '${c.apartamentoDetalhe || ''}')" 
             style="padding:12px; border-bottom:1px solid #eee; cursor:pointer; background:#fffbf0; font-weight:bold; color:#333;">
             👤 ${c.cliente} <br><span style="font-size:11px; color:#777;">📍 ${c.rua || ''}, Nº ${c.numero \vert{}\vert{} ''} -${c.bairro || ''}</span>
        </div>
    `).join("");
}

function aplicarClienteCadastrado(nome, cidade, bairro, rua, numero, apto, aptoDet) {
    document.getElementById("ent_nome_cliente").value = nome;
    document.getElementById("sugestoes_clientes").innerHTML = "";

    entregaEmEdicao = {
        cliente: nome, cidade: cidade, bairro: bairro, rua: rua,
        numero: numero, apartamento: apto, aptoDetalhe: aptoDet,
        caixas: 1, gelados: "Não"
    };

    let painel = document.getElementById("painel_cascata_botoes");
    painel.innerHTML = `
        <div style="background:#d1ecf1; color:#0c5460; padding:12px; border-radius:6px; margin-bottom:10px; border-left:5px solid #17a2b8;">
            <strong>📍 Endereço Recorrente:</strong><br>
            ${rua}, ${numero}${apto === 'Sim' ? '- ' + aptoDet : ''}<br>
            ${bairro} (${cidade})
            <button onclick="renderizarBotoesCidade()" style="margin-top:8px; display:block; padding:4px 8px; background:#17a2b8; color:white; border:none; border-radius:4px; font-size:11px; cursor:pointer;">🔄 Alterar Endereço</button>
        </div>
    `;

    document.getElementById("formulario_final_entrega").style.display = "block";
    document.getElementById("ent_numero").value = numero;
    document.getElementById("ent_apto").value = apto;
    toggleCampoApartamento(apto);
    document.getElementById("ent_apto_detalhe").value = aptoDet;
}

async function renderizarBotoesCidade() {
    let cidades = ["MANHUMIRIM", "ALTO JEQUITIBÁ", "MANHUAÇU"];

    if (supabaseClient) {
        let { data } = await supabaseClient.from('enderecos').select('cidade');
        if (data && data.length > 0) {
            cidades = [...new Set(data.map(r => r.cidade))].sort();
        }
    }

    let painel = document.getElementById("painel_cascata_botoes");
    if (!painel) return;

    document.getElementById("formulario_final_entrega").style.display = "none";

    painel.innerHTML = `
        <label style="font-weight:bold; font-size:13px; color:#555; display:block; margin-bottom:5px;">1. Selecione a Cidade:</label>
        <div style="display:flex; gap:8px; flex-wrap:wrap;">
            ${cidades.map(cid => `<button onclick="selecionarCidade('${cid}')" style="padding:12px; background:#fff; border:2px solid #0275d8; color:#0275d8; border-radius:6px; font-weight:bold; cursor:pointer;">🏙️ ${cid}</button>`).join("")}
        </div>
    `;
}

async function selecionarCidade(nomeCidade) {
    entregaEmEdicao.cidade = nomeCidade;
    let bairros = [];

    if (supabaseClient) {
        let { data } = await supabaseClient
            .from('enderecos')
            .select('bairro')
            .eq('cidade', nomeCidade);
        if (data) bairros = [...new Set(data.map(r => r.bairro))].sort();
    }

    let painel = document.getElementById("painel_cascata_botoes");
    painel.innerHTML = `
        <div style="color:#28a745; font-size:13px; margin-bottom:8px;">✅ Cidade: <b>${nomeCidade}</b></div>
        <label style="font-weight:bold; font
async function autenticarNoSupabase(nomeDigitado, matriculaDigitada) {
    if (!supabaseClient) return false;

    let { data, error } = await supabaseClient
        .from('usuarios') // Nome da tabela de colaboradores no Supabase
        .select('*')
        .eq('matricula', matriculaDigitada)
        .single();

    if (error || !data) {
        alert("Matrícula não encontrada ou acesso negado.");
        return false;
    }

    // Salva as credenciais da sessão no navegador
    usuarioAtual = data.nome;
    setorSelecionado = data.setor;
    localStorage.setItem("usuarioAtual", data.nome);
    localStorage.setItem("setorAtual", data.setor);
    localStorage.setItem("lojaAtual", data.loja);

    return true;
}
