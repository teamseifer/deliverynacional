(function (global) {
	const KEY = 'acai_carrinho';

	function brl(n) {
		return Number(n).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
	}

	function read() {
		try {
			const c = JSON.parse(localStorage.getItem(KEY) || '[]');
			return Array.isArray(c) ? c : [];
		} catch {
			return [];
		}
	}

	function write(items) {
		localStorage.setItem(KEY, JSON.stringify(items));
		refreshUi();
	}

	function total(items) {
		return items.reduce((s, i) => s + (Number(i.preco) || 0) * (Number(i.quantidade) || 1), 0);
	}

	function checkoutPath() {
		return location.pathname.includes('/produtos/') ? '../../checkout/index.html' : 'checkout/index.html';
	}

	function indexPath() {
		return location.pathname.includes('/produtos/') ? '../../index.html' : 'index.html';
	}

	function isPaginaProduto() {
		return location.pathname.includes('/produtos/');
	}

	function ensureDom() {
		if (document.getElementById('acai-carrinho-bar')) return;

		const bar = document.createElement('div');
		bar.id = 'acai-carrinho-bar';
		bar.className = 'acai-carrinho-bar hidden';
		bar.innerHTML = `
			<div class="info">
				<span>Seu carrinho</span>
				<strong id="acai-carrinho-total-bar">R$ 0,00</strong>
			</div>
			<div class="actions">
				<button type="button" class="btn-ver" id="acai-btn-ver-sacola">Ver sacola (<span id="acai-carrinho-qtd">0</span>)</button>
				<button type="button" class="btn-continuar" id="acai-btn-continuar">Continuar comprando</button>
				<button type="button" class="btn-finalizar" id="acai-btn-finalizar-bar">Finalizar pedido</button>
			</div>
		`;

		const overlay = document.createElement('div');
		overlay.id = 'acai-carrinho-overlay';

		const drawer = document.createElement('div');
		drawer.id = 'acai-carrinho-drawer';
		drawer.innerHTML = `
			<div class="acai-carrinho-head">
				<span>Meu carrinho</span>
				<button type="button" id="acai-carrinho-fechar" aria-label="Fechar">×</button>
			</div>
			<div class="acai-carrinho-lista" id="acai-carrinho-lista"></div>
			<div class="acai-carrinho-foot">
				<div class="total-linha"><span>Total</span><span id="acai-carrinho-total-drawer">R$ 0,00</span></div>
				<button type="button" class="btn-finalizar-drawer" id="acai-btn-finalizar-drawer">Finalizar pedido</button>
			</div>
		`;

		document.body.appendChild(bar);
		document.body.appendChild(overlay);
		document.body.appendChild(drawer);

		document.getElementById('acai-btn-ver-sacola').onclick = openDrawer;
		document.getElementById('acai-btn-continuar').onclick = () => {
			window.location.href = indexPath();
		};
		document.getElementById('acai-btn-finalizar-bar').onclick = finalizarPedido;
		document.getElementById('acai-btn-finalizar-drawer').onclick = finalizarPedido;
		document.getElementById('acai-carrinho-fechar').onclick = closeDrawer;
		overlay.onclick = closeDrawer;
	}

	function refreshUi() {
		ensureDom();
		const items = read();
		const qtd = items.length;
		const soma = total(items);
		const bar = document.getElementById('acai-carrinho-bar');
		const lista = document.getElementById('acai-carrinho-lista');

		if (qtd === 0) {
			bar.classList.add('hidden');
			document.body.classList.remove('com-carrinho-bar');
		} else {
			bar.classList.remove('hidden');
			document.body.classList.add('com-carrinho-bar');
		}

		document.getElementById('acai-carrinho-qtd').textContent = String(qtd);
		document.getElementById('acai-carrinho-total-bar').textContent = brl(soma);
		document.getElementById('acai-carrinho-total-drawer').textContent = brl(soma);

		const btnContinuar = document.getElementById('acai-btn-continuar');
		const btnFinalizarBar = document.getElementById('acai-btn-finalizar-bar');
		if (isPaginaProduto()) {
			btnContinuar.style.display = '';
			btnFinalizarBar.style.display = 'none';
			document.body.classList.add('carrinho-em-produto');
		} else {
			btnContinuar.style.display = 'none';
			btnFinalizarBar.style.display = '';
			document.body.classList.remove('carrinho-em-produto');
		}

		if (!lista) return;
		if (qtd === 0) {
			lista.innerHTML = '<p class="acai-carrinho-vazio">Nenhum item no carrinho ainda.</p>';
			return;
		}

		lista.innerHTML = items
			.map(
				(item) => `
			<div class="acai-item" data-id="${item.id}">
				<div class="nome">${item.nome}${item.observacao ? `<div class="obs">${item.observacao}</div>` : ''}</div>
				<div class="preco">${brl(item.preco)}</div>
				<button type="button" class="remover" data-remover="${item.id}">Remover</button>
			</div>
		`
			)
			.join('');

		lista.querySelectorAll('[data-remover]').forEach((btn) => {
			btn.onclick = () => {
				remove(btn.getAttribute('data-remover'));
			};
		});
	}

	function add(item) {
		const items = read();
		items.push({
			id: `${item.slug || 'item'}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
			slug: item.slug,
			nome: item.nome,
			preco: item.preco,
			observacao: item.observacao || '',
			quantidade: 1,
			adicionadoEm: new Date().toISOString(),
		});
		write(items);
		return items.length;
	}

	function remove(id) {
		write(read().filter((i) => i.id !== id));
	}

	function openDrawer() {
		refreshUi();
		document.getElementById('acai-carrinho-overlay').classList.add('aberto');
		document.getElementById('acai-carrinho-drawer').classList.add('aberto');
		document.body.style.overflow = 'hidden';
	}

	function closeDrawer() {
		document.getElementById('acai-carrinho-overlay').classList.remove('aberto');
		document.getElementById('acai-carrinho-drawer').classList.remove('aberto');
		document.body.style.overflow = '';
	}

	function finalizarPedido() {
		const items = read();
		if (!items.length) {
			if (typeof Swal !== 'undefined') {
				Swal.fire({ icon: 'info', title: 'Carrinho vazio', text: 'Escolha um açaí no cardápio primeiro.' });
			} else {
				alert('Adicione itens ao carrinho.');
			}
			return;
		}
		sessionStorage.setItem(
			'acai_checkout',
			JSON.stringify({
				itens: items,
				subtotal: total(items),
				atualizadoEm: new Date().toISOString(),
			})
		);
		const params = new URLSearchParams(window.location.search);
		const qs = params.toString();
		window.location.href = checkoutPath() + (qs ? '?' + qs : '');
	}

	global.AcaiCarrinho = {
		add,
		remove,
		read,
		total,
		refreshUi,
		openDrawer,
		closeDrawer,
		finalizarPedido,
	};

	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', refreshUi);
	} else {
		refreshUi();
	}
})(window);