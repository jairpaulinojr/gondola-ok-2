// ==========================================
// 1. INICIALIZAÇÃO E CONEXÃO COM O SUPABASE
// ==========================================
const SUPABASE_URL = 'https://seu-projeto.supabase.co'; // Cole aqui a sua URL real do Supabase
const SUPABASE_ANON_KEY = 'sua-chave-anon-aqui'; // Cole aqui a sua chave anon real

let supabaseClient = null;
if (window.supabase) {
    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

// Função de apoio para voltar ao menu principal
function voltarMenuPrincipal() {
    let container = document.querySelector(".container");
    if (!container) return;

    container.innerHTML = `
        <div class="topo" style="background:#343a40; color:white; padding:20px; text-align:center; border-radius:8px 8px 0 0;">
            <h1>🏪 MENU OPERACIONAL</h1>
            <p>Selecione o módulo desejado</p>
        </div>
        <div style="padding:20px; text-align:center; background:#fff; border-radius:0 0 8px 8px; box-shadow:0 4px 6px rgba(0,0,0,0.1);">
            <button onclick="abrirAbaValidade()" style="width:100%; padding:14px; margin:8px 0; background:#28a745; color:white; border:none; border-radius:6px; font-weight:bold; cursor:pointer;">📅 Verificação de Validade</button>
            <button onclick="abrirColetorEtiquetas()" style="width:100%; padding:14px; margin:8px 0; background:#ffc107; color:#333; border:none; border-radius:6px; font-weight:bold; cursor:pointer;">🏷️ Emissão de Etiquetas</button>
            <button onclick="abrirMonitoramentoEntregas()" style="width:100%; padding:14px; margin:8px 0; background:#17a2b8; color:white; border:none; border-radius:6px; font-weight:bold; cursor:pointer;">🚚 Cadastro / Gestão de Entregas</button>
            <button onclick="abrirBuscaMissoesGlobal()" style="width:100%; padding:14px; margin:8px 0; background:#007bff; color:white; border:none; border-radius:6px; font-weight:bold; cursor:pointer;">🔍 Busca de Missões / Base Global</button>
        </div>
    `;
}


// ==========================================
// 2. FUNÇÃO AUXILIAR DE BUSCA GLOBAL
// ==========================================
async function buscarProdutoSupabase(codigoBarras) {
    let codigoLimpo = codigoBarras ? String(codigoBarras).trim() : "";
    if (!codigoLimpo || !supabaseClient) return null;

    try {
        let { data, error } = await supabaseClient
            .from('cadastro_global')
            .select('*')
            .eq('CODIGO DE BARRAS', codigoLimpo)
            .single();

        if (error || !data) return null;

        return {
            codigo: data['CODIGO DE BARRAS'],
            descricao: data['PRODUTO'] || "Produto sem descrição"
        };
    } catch (e) {
        console.error("Erro ao buscar no cadastro_global:", e);
        return null;
    }
}


// ==========================================
// 3. MÓDULO DE VERIFICAÇÃO DE VALIDADE
// ==========================================
function abrirAbaValidade() {
    let container = document.querySelector(".container");
    if (!container) return;

    container.innerHTML = `
        <div class="topo" style="background:#28a745; color:white; padding:15px; text-align:center;">
            <h1>📅 VERIFICAÇÃO DE VALIDADE</h1>
        </div>
        <div style="padding:20px; text-align:left;">
            <label style="font-weight:bold;">Código de Barras:</label>
            <input type="text" id="input-manual-code" placeholder="Bipe ou digite o código..." style="width:100%; padding:12px; margin:8px 0 15px; box-sizing:border-box;">
            <button onclick="processarBuscaValidade()" style="padding:12px; background:#28a745; color:white; width:100%; border:none; border-radius:5px; font-weight:bold; cursor:pointer;">🔍 VERIFICAR PRODUTO</button>
            
            <div id="resultado-validade" style="margin-top:20px; display:none; background:#f9f9f9; padding:15px; border-radius:5px; border:1px solid #ddd;"></div>
            <br>
            <button onclick="voltarMenuPrincipal()" style="background:#6c757d; color:white; width:100%; padding:12px; border:none; border-radius:5px; font-weight:bold; cursor:pointer;">⬅️ Voltar ao Menu</button>
        </div>
    `;
    setTimeout(() => document.getElementById("input-manual-code")?.focus(), 100);
}

async function processarBuscaValidade() {
    let codigo = document.getElementById("input-manual-code").value;
    let display = document.getElementById("resultado-validade");
    if (!display) return;
    
    display.style.display = "block";
    display.innerHTML = `<p style="text-align:center; color:#6c757d;">🔍 Consultando cadastro global...</p>`;

    let produto = await buscarProdutoSupabase(codigo);

    if (!produto) {
        display.innerHTML = `<p style="color:red; text-align:center;">❌ Produto não encontrado na tabela 'cadastro_global'.</p>`;
        return;
    }

    display.innerHTML = `
        <p><strong>Produto:</strong> ${produto.descricao}</p>
        <p><strong>Código:</strong> ${produto.codigo}</p>
        <label style="font-weight:bold;">Data de Vencimento:</label>
        <input type="date" id="data-venc" style="width:100%; padding:10px; margin:8px 0 15px; box-sizing:border-box;">
        <label style="font-weight:bold;">Quantidade:</label>
        <input type="number" id="qtd-venc" value="1" min="1" style="width:100%; padding:10px; margin:8px 0 15px; box-sizing:border-box;">
        <button onclick="salvarValidadeSupabase('${produto.codigo}', '${produto.descricao.replace(/'/g, "\\'")}')" style="background:#28a745; color:white; width:100%; padding:12px; border:none; border-radius:5px; font-weight:bold; cursor:pointer;">💾 Salvar no Supabase</button>
    `;
}

async function salvarValidadeSupabase(codigo, descricao) {
    let dataInput = document.getElementById("data-venc").value;
    let qtdInput = document.getElementById("qtd-venc").value;

    if (!dataInput) {
        alert("⚠️ Escolha uma data de vencimento!");
        return;
    }

    let partes = dataInput.split("-");
    let dataFormatada = `${partes[2]}/${partes[1]}/${partes[0]}`;

    let registro = {
        descricao: descricao,
        "codigo de barras": String(codigo),
        validade: dataFormatada,
        quantidade: String(qtdInput)
    };

    if (supabaseClient) {
        let { error } = await supabaseClient.from('validade').insert([registro]);
        if (error) {
            console.error("Erro ao salvar validade:", error);
            alert("❌ Erro ao salvar validade no Supabase.");
            return;
        }
    }

    alert("✅ Validade gravada com sucesso!");
    abrirAbaValidade();
}


// ==========================================
// 4. MÓDULO DE EMISSÃO / COLETA DE ETIQUETAS
// ==========================================
function abrirColetorEtiquetas() {
    let container = document.querySelector(".container");
    if (!container) return;

    container.innerHTML = `
        <div class="topo" style="background:#ffc107; color:#333; padding:15px; text-align:center;">
            <h1>🏷️ EMISSÃO DE ETIQUETAS</h1>
        </div>
        <div style="padding:20px; text-align:left;">
            <label style="font-weight:bold;">Código de Barras:</label>
            <input id="input_coletor_etiqueta" placeholder="Bipe ou digite o código..." style="width:100%; padding:14px; margin:8px 0 15px; box-sizing:border-box;">

            <button onclick="processarBuscaEtiqueta()" style="width:100%; padding:14px; background:#28a745; color:white; border:0; border-radius:6px; font-weight:bold; cursor:pointer;">
                🔍 VERIFICAR E SOLICITAR ETIQUETA
            </button>

            <div id="resultado_busca_coletor" style="margin-top:20px;"></div>

            <button onclick="voltarMenuPrincipal()" style="width:100%; padding:12px; background:#6c757d; color:white; border:0; border-radius:6px; margin-top:20px; cursor:pointer; font-weight:bold;">
                ↩ Voltar ao Menu
            </button>
        </div>
    `;
    setTimeout(() => document.getElementById("input_coletor_etiqueta")?.focus(), 100);
}

async function processarBuscaEtiqueta() {
    let codigo = document.getElementById("input_coletor_etiqueta").value;
    let resultado = document.getElementById("resultado_busca_coletor");
    if (!resultado) return;

    resultado.innerHTML = `<p style="text-align:center; color:#6c757d;">🔍 Buscando produto...</p>`;

    let produto = await buscarProdutoSupabase(codigo);

    if (produto) {
        resultado.innerHTML = `
            <div style="background:#d4edda; padding:15px; border-radius:6px; color:#155724;">
                <strong>✅ PRODUTO LOCALIZADO</strong>
                <p style="font-weight:bold; font-size:16px; margin:5px 0;">${produto.descricao}</p>
                <small>Cód: ${produto.codigo}</small>
            </div>
            <button onclick="gerarSolicitacaoEtiqueta('${produto.codigo}', '${produto.descricao.replace(/'/g, "\\'")}')" style="width:100%; padding:14px; background:#28a745; color:white; border:0; border-radius:6px; margin-top:15px; font-weight:bold; cursor:pointer;">
                💾 Confirmar e Enviar para Fila de Etiquetas
            </button>
        `;
    } else {
        resultado.innerHTML = `
            <div style="background:#fff3cd; padding:15px; border-radius:6px; color:#856404;">
                ⚠️ Produto não cadastrado na Base Global.
            </div>
        `;
    }
}

async function gerarSolicitacaoEtiqueta(codigo, descricao) {
    if (!supabaseClient) {
        alert("Erro de conexão com o Supabase.");
        return;
    }

    let itemEtiqueta = {
        descricao: descricao,
        "codigo de barras": String(codigo)
    };

    let { error } = await supabaseClient.from('etiquetas_pendentes').insert([itemEtiqueta]);

    if (error) {
        console.error("Erro ao gerar etiqueta:", error);
        alert("❌ Erro ao enviar etiqueta para o Supabase.");
        return;
    }

    alert("✅ Etiqueta enviada para a fila de impressão!");
    abrirColetorEtiquetas();
}


// ==========================================
// 5. MÓDULO DE ENTREGAS (ALINHADO ÀS COLUNAS REAIS)
// ==========================================
function abrirMonitoramentoEntregas() {
    let container = document.querySelector(".container");
    if (!container) return;

    container.innerHTML = `
        <div class="topo" style="background:#17a2b8; color:white; padding:15px; text-align:center;">
            <h1>🚚 CADASTRO DE ENTREGAS</h1>
        </div>
        <div style="padding:20px; text-align:left;">
            <div style="background:#f8f9fa; padding:15px; border-radius:6px; margin-bottom:15px; border:1px solid #ddd;">
                <h3 style="margin-top:0; color:#333;">Nova Entrega</h3>
                
                <label style="font-weight:bold; font-size:13px;">Cliente:</label>
                <input id="input_cliente_entrega" placeholder="Nome do cliente..." style="width:100%; padding:10px; margin:5px 0 10px; box-sizing:border-box;">

                <label style="font-weight:bold; font-size:13px;">Cidade:</label>
                <input id="input_cidade_entrega" placeholder="Nome da cidade..." style="width:100%; padding:10px; margin:5px 0 10px; box-sizing:border-box;">

                <label style="font-weight:bold; font-size:13px;">Bairro:</label>
                <input id="input_bairro_entrega" placeholder="Nome do bairro..." style="width:100%; padding:10px; margin:5px 0 10px; box-sizing:border-box;">

                <label style="font-weight:bold; font-size:13px;">Rua:</label>
                <input id="input_rua_entrega" placeholder="Nome da rua..." style="width:100%; padding:10px; margin:5px 0 10px; box-sizing:border-box;">

                <label style="font-weight:bold; font-size:13px;">Número:</label>
                <input id="input_numero_entrega" placeholder="Número..." style="width:100%; padding:10px; margin:5px 0 15px; box-sizing:border-box;">

                <button onclick="salvarNovaEntregaSupabase()" style="width:100%; padding:12px; background:#28a745; color:white; border:0; border-radius:5px; font-weight:bold; cursor:pointer;">
                    💾 Salvar Entrega na Nuvem
                </button>
            </div>

            <h3 style="color:#333;">Entregas Cadastradas</h3>
            <div id="lista_entregas_container" style="margin-top:10px;">
                <p style="color:#6c757d; text-align:center;">⏳ Carregando entregas...</p>
            </div>

            <button onclick="voltarMenuPrincipal()" style="width:100%; padding:12px; background:#6c757d; color:white; border:0; border-radius:6px; margin-top:20px; cursor:pointer; font-weight:bold;">
                ↩ Voltar ao Menu
            </button>
        </div>
    `;

    carregarListaEntregasSupabase();
}

async function salvarNovaEntregaSupabase() {
    let cliente = document.getElementById("input_cliente_entrega").value.trim();
    let cidade = document.getElementById("input_cidade_entrega").value.trim();
    let bairro = document.getElementById("input_bairro_entrega").value.trim();
    let rua = document.getElementById("input_rua_entrega").value.trim();
    let numero = document.getElementById("input_numero_entrega").value.trim();

    if (!cliente || !cidade) {
        alert("⚠️ Preencha pelo menos o Cliente e a Cidade!");
        return;
    }

    if (!supabaseClient) {
        alert("❌ Erro de conexão com o Supabase.");
        return;
    }

    let dadosEntrega = {
        cliente: cliente,
        cidade: cidade,
        bairro: bairro,
        rua: rua,
        numero: numero
    };

    let { error } = await supabaseClient.from('entregas').insert([dadosEntrega]);

    if (error) {
        console.error("Erro ao salvar entrega:", error);
        alert("❌ Erro ao salvar entrega no Supabase.");
        return;
    }

    alert("✅ Entrega salva com sucesso!");
    abrirMonitoramentoEntregas();
}

async function carregarListaEntregasSupabase() {
    let containerLista = document.getElementById("lista_entregas_container");
    if (!containerLista || !supabaseClient) return;

    let { data, error } = await supabaseClient.from('entregas').select('*');

    if (error || !data) {
        containerLista.innerHTML = `<p style="color:red; text-align:center;">❌ Erro ao carregar entregas.</p>`;
        return;
    }

    if (data.length === 0) {
        containerLista.innerHTML = `<p style="color:#6c757d; text-align:center;">Nenhuma entrega registada.</p>`;
        return;
    }

    let htmlTabela = `
        <table style="width:100%; border-collapse:collapse; background:white; font-size:13px;">
            <tr style="background:#f2f2f2; text-align:left;">
                <th style="padding:8px;">Cliente</th>
                <th style="padding:8px;">Endereço</th>
            </tr>
    `;

    data.forEach((item) => {
        let cli = item.cliente || "N/D";
        let cid = item.cidade || "";
        let bai = item.bairro || "";
        let rua = item.rua || "";
        let num = item.numero || "";

        htmlTabela += `
            <tr style="border-bottom:1px solid #ddd;">
                <td style="padding:8px;"><strong>${cli}</strong></td>
                <td style="padding:8px;">${rua}, ${num} - ${bai} (${cid})</td>
            </tr>
        `;
    });

    htmlTabela += `</table>`;
    containerLista.innerHTML = htmlTabela;
}


// ==========================================
// 6. MÓDULO DE BUSCA DE MISSÕES (LOJA, SETOR E PRODUTO)
// ==========================================
function abrirBuscaMissoesGlobal() {
    let container = document.querySelector(".container");
    if (!container) return;

    container.innerHTML = `
        <div class="topo" style="background:#007bff; color:white; padding:15px; text-align:center;">
            <h1>🔍 BUSCA DE MISSÕES / AUDITORIA</h1>
        </div>
        <div style="padding:15px; text-align:left;">
            <div style="background:#f8f9fa; padding:15px; border-radius:6px; border:1px solid #ddd; margin-bottom:15px;">
                <label style="font-weight:bold; font-size:13px;">Loja:</label>
                <input id="filtro_loja" placeholder="Ex: MIRANDA MANHUMIRIM..." style="width:100%; padding:10px; margin:5px 0 10px; box-sizing:border-box;">

                <label style="font-weight:bold; font-size:13px;">Setor:</label>
                <input id="filtro_setor" placeholder="Ex: seca basica, bebidas, acougue..." style="width:100%; padding:10px; margin:5px 0 10px; box-sizing:border-box;">

                <label style="font-weight:bold; font-size:13px;">Produto / Descrição:</label>
                <input id="filtro_produto" placeholder="Digite o nome do produto..." style="width:100%; padding:10px; margin:5px 0 15px; box-sizing:border-box;">

                <button onclick="executarPesquisaMissoes()" style="width:100%; padding:12px; background:#007bff; color:white; border:0; border-radius:5px; font-weight:bold; cursor:pointer;">
                    🔍 PESQUISAR PRODUTOS
                </button>
            </div>

            <div id="resultado_busca_missoes">
                <p style="color:#6c757d; text-align:center;">Preencha os campos acima para realizar a busca.</p>
            </div>

            <button onclick="voltarMenuPrincipal()" style="width:100%; padding:12px; background:#6c757d; color:white; border:0; border-radius:6px; margin-top:20px; cursor:pointer; font-weight:bold;">
                ↩ Voltar ao Menu
            </button>
        </div>
    `;
}

async function buscarNaTabelaGlobalAvancada(filtroLoja, filtroSetor, termoProduto) {
    if (!supabaseClient) return [];

    try {
        let query = supabaseClient.from('missoes_tabela_global').select('*');

        if (filtroLoja && filtroLoja.trim() !== "") {
            query = query.ilike('loja', `%${filtroLoja.trim()}%`);
        }
        if (filtroSetor && filtroSetor.trim() !== "") {
            query = query.ilike('setor', `%${filtroSetor.trim()}%`);
        }
        if (termoProduto && termoProduto.trim() !== "") {
            query = query.ilike('descricao', `%${termoProduto.trim()}%`);
        }

        let { data, error } = await query.limit(50);

        if (error) {
            console.error("Erro na busca avançada:", error);
            return [];
        }

        return data || [];
    } catch (e) {
        console.error("Erro de conexão:", e);
        return [];
    }
}

async function executarPesquisaMissoes() {
    let loja = document.getElementById("filtro_loja").value;
    let setor = document.getElementById("filtro_setor").value;
    let produto = document.getElementById("filtro_produto").value;
    let containerResultado = document.getElementById("resultado_busca_missoes");

    if (!containerResultado) return;
    containerResultado.innerHTML = `<p style="text-align:center; color:#6c757d;">⏳ Buscando no Supabase...</p>`;

    let resultados = await buscarNaTabelaGlobalAvancada(loja, setor, produto);

    if (resultados.length === 0) {
        containerResultado.innerHTML = `<p style="color:red; text-align:center; font-weight:bold;">❌ Nenhum produto localizado com estes filtros.</p>`;
        return;
    }

    let html = `
        <p style="color:green; font-weight:bold; margin-bottom:10px;">Encontrado(s) ${resultados.length} item(ns):</p>
        <table style="width:100%; border-collapse:collapse; background:white; font-size:12px;">
            <tr style="background:#e9ecef; text-align:left;">
                <th style="padding:8px;">Produto</th>
                <th style="padding:8px;">Setor</th>
                <th style="padding:8px;">Loja</th>
            </tr>
    `;

    resultados.forEach(item => {
        let desc = item.descricao || "Sem Descrição";
        let cod = item["codigo de barras"] || "";
        let set = item.setor || "-";
        let loj = item.loja || "-";

        html += `
            <tr style="border-bottom:1px solid #ddd;">
                <td style="padding:8px;"><strong>${desc}</strong><br><small style="color:#555;">Cód: ${cod}</small></td>
                <td style="padding:8px;">${set}</td>
                <td style="padding:8px;">${loj}</td>
            </tr>
        `;
    });

    html += `</table>`;
    containerResultado.innerHTML = html;
}
