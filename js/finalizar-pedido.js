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

	function salvarPedido(extra) {
		const titulo = document.querySelector('#detalhesProduto .info1 h3, #detalhesProduto h3');
		const nome = titulo ? titulo.textContent.trim() : slugFromPath();
		const precoEl = document.querySelector('#precoProduto');
		const preco = parsePreco(precoEl ? precoEl.textContent : '');
		const pedido = {
			slug: slugFromPath(),
			nome,
			preco,
			observacao: coletarObservacao(),
			criadoEm: new Date().toISOString(),
			...extra,
		};
		sessionStorage.setItem('acai_pedido', JSON.stringify(pedido));
	}

	function irCheckout() {
		const params = new URLSearchParams(window.location.search);
		const qs = params.toString();
		window.location.href = '../../checkout/index.html' + (qs ? '?' + qs : '');
	}

	window.finalizar = function finalizar() {
		if (typeof Swal === 'undefined') {
			salvarPedido({ entrega: 'agora' });
			irCheckout();
			return;
		}
		Swal.fire({
			title: 'Deseja que entregamos agora?',
			showDenyButton: true,
			showCancelButton: false,
			allowOutsideClick: false,
			icon: 'question',
			confirmButtonText: 'Sim, por favor!',
			confirmButtonColor: '#5b0e5c',
			denyButtonText: 'Não, quero agendar a entrega!',
			focusConfirm: true,
		}).then((result) => {
			if (result.isConfirmed) {
				salvarPedido({ entrega: 'agora' });
				irCheckout();
			} else if (result.isDenied) {
				Swal.fire({
					title: 'Selecione o dia e a hora, por gentileza!',
					text: 'Deixe seu pedido agendado e receba na hora combinada.',
					confirmButtonText: 'Continuar para pagamento',
					confirmButtonColor: '#5b0e5c',
					showCancelButton: false,
					allowOutsideClick: false,
					input: 'datetime-local',
					inputValidator: (v) => (v ? undefined : 'Escolha data e hora'),
				}).then((r) => {
					if (r.isConfirmed) {
						salvarPedido({ entrega: 'agendado', agendadoPara: r.value });
						irCheckout();
					}
				});
			}
		});
	};
})();