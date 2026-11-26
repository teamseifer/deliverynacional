(function () {
	function parsePreco(text) {
		const m = String(text || '').match(/[\d.,]+/);
		if (!m) return 0;
		return parseFloat(m[0].replace(/\./g, '').replace(',', '.')) || 0;
	}

	function slugFromPath() {
		const part = window.location.pathname.split('/').pop() || '';
		return part.replace(/\.html$/, '');
	}

	function coletarObservacao() {
		const el = document.querySelector('.observacao');
		return el ? String(el.value || '').trim().slice(0, 140) : '';
	}

	function montarItem() {
		const titulo = document.querySelector('#detalhesProduto .info1 h3, #detalhesProduto h3');
		const nome = titulo ? titulo.textContent.trim() : slugFromPath();
		const precoEl = document.querySelector('#precoProduto');
		const preco = parsePreco(precoEl ? precoEl.textContent : '');
		if (!preco) return null;
		return {
			slug: slugFromPath(),
			nome,
			preco,
			observacao: coletarObservacao(),
		};
	}

	window.adicionarAoCarrinho = function adicionarAoCarrinho() {
		const item = montarItem();
		if (!item) {
			if (typeof Swal !== 'undefined') {
				Swal.fire({ icon: 'warning', title: 'Monte seu açaí', text: 'Selecione as opções do pedido antes de adicionar.' });
			}
			return;
		}

		if (!window.AcaiCarrinho) {
			alert('Erro ao carregar o carrinho. Recarregue a página.');
			return;
		}

		window.AcaiCarrinho.add(item);

		if (typeof Swal !== 'undefined') {
			Swal.fire({
				icon: 'success',
				title: 'Adicionado ao carrinho!',
				html: `<b>${item.nome}</b><br>Que tal montar mais um combo?`,
				showDenyButton: true,
				confirmButtonText: 'Continuar montando',
				denyButtonText: 'Ver sacola',
				confirmButtonColor: '#077c22',
				denyButtonColor: '#5b0e5c',
			}).then((r) => {
				if (r.isDenied) window.AcaiCarrinho.openDrawer();
			});
		}
	};

	window.finalizar = window.adicionarAoCarrinho;
})();