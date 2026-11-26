(function () {
	const TAXA_RAPIDA = 6;
	const API = '/api/gateway';

	function brl(n) {
		return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
	}

	function digits(s) {
		return String(s || '').replace(/\D/g, '');
	}

	function getCheckoutData() {
		try {
			const pack = JSON.parse(sessionStorage.getItem('acai_checkout') || 'null');
			if (pack?.itens?.length) {
				return { itens: pack.itens, subtotal: Number(pack.subtotal) || 0 };
			}
		} catch {}
		try {
			const legacy = JSON.parse(sessionStorage.getItem('acai_pedido') || 'null');
			if (legacy?.preco) {
				return {
					itens: [legacy],
					subtotal: Number(legacy.preco) || 0,
				};
			}
		} catch {}
		try {
			const fromStorage = JSON.parse(localStorage.getItem('acai_carrinho') || '[]');
			if (Array.isArray(fromStorage) && fromStorage.length) {
				const subtotal = fromStorage.reduce((s, i) => s + (Number(i.preco) || 0), 0);
				return { itens: fromStorage, subtotal };
			}
		} catch {}
		return null;
	}

	function utmParams() {
		const p = new URLSearchParams(window.location.search);
		const o = {};
		for (const k of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'xcod', 'sck']) {
			if (p.get(k)) o[k] = p.get(k);
		}
		return o;
	}

	const checkout = getCheckoutData();
	if (!checkout || !checkout.itens.length) {
		window.location.replace('../index.html');
		return;
	}

	const el = (id) => document.getElementById(id);
	const itens = checkout.itens;
	let subtotal = Number(checkout.subtotal) || 0;
	if (!subtotal) {
		subtotal = itens.reduce((s, i) => s + (Number(i.preco) || 0) * (Number(i.quantidade) || 1), 0);
	}

	function taxaEntrega() {
		const tipo = document.querySelector('input[name="tipo_entrega"]:checked');
		return tipo && tipo.value === 'rapida' ? TAXA_RAPIDA : 0;
	}

	function atualizarTotais() {
		const taxa = taxaEntrega();
		const total = Math.round((subtotal + taxa) * 100) / 100;
		el('resumo-subtotal').textContent = brl(subtotal);
		el('resumo-total').textContent = brl(total);
		if (taxa > 0) {
			el('resumo-entrega').textContent = 'Rápida — R$ 6,00 (até 15 min)';
		} else {
			el('resumo-entrega').textContent = 'Grátis (60–90 min)';
		}
		return total;
	}

	const lista = el('resumo-itens');
	lista.innerHTML = itens
		.map(
			(item) => `
		<li>
			<span class="item-preco">${brl(item.preco)}</span>
			<div class="item-nome">${item.nome || item.slug}</div>
			${item.observacao ? `<div class="item-obs">Obs: ${item.observacao}</div>` : ''}
		</li>`
		)
		.join('');
	el('resumo-subtotal').textContent = brl(subtotal);
	atualizarTotais();

	document.querySelectorAll('input[name="tipo_entrega"]').forEach((r) => {
		r.addEventListener('change', atualizarTotais);
	});

	function formatCpf(value) {
		const d = digits(value).slice(0, 11);
		if (d.length <= 3) return d;
		if (d.length <= 6) return d.slice(0, 3) + '.' + d.slice(3);
		if (d.length <= 9) return d.slice(0, 3) + '.' + d.slice(3, 6) + '.' + d.slice(6);
		return d.slice(0, 3) + '.' + d.slice(3, 6) + '.' + d.slice(6, 9) + '-' + d.slice(9);
	}

	function formatTelefone(value) {
		const d = digits(value).slice(0, 11);
		if (d.length <= 2) return d.length ? '(' + d : '';
		if (d.length <= 6) return '(' + d.slice(0, 2) + ') ' + d.slice(2);
		if (d.length <= 10) return '(' + d.slice(0, 2) + ') ' + d.slice(2, 6) + '-' + d.slice(6);
		return '(' + d.slice(0, 2) + ') ' + d.slice(2, 7) + '-' + d.slice(7);
	}

	function maskInput(input, formatter) {
		input.addEventListener('input', () => {
			const start = input.selectionStart;
			const before = input.value;
			const digitsBefore = digits(before.slice(0, start)).length;
			input.value = formatter(input.value);
			let pos = 0;
			let seen = 0;
			const v = input.value;
			for (let i = 0; i < v.length; i++) {
				if (/\d/.test(v[i])) seen++;
				if (seen >= digitsBefore) {
					pos = i + 1;
					break;
				}
			}
			if (seen < digitsBefore) pos = v.length;
			input.setSelectionRange(pos, pos);
		});
		input.addEventListener('blur', () => {
			input.value = formatter(input.value);
		});
	}

	maskInput(el('cpf'), formatCpf);
	maskInput(el('telefone'), formatTelefone);

	function setCepMsg(msg, err) {
		const m = el('cep-msg');
		m.textContent = msg || '';
		m.style.color = err ? '#c62828' : '#077c22';
	}

	let cepTimer;
	el('cep').addEventListener('input', () => {
		let v = digits(el('cep').value);
		if (v.length > 8) v = v.slice(0, 8);
		el('cep').value = v.length > 5 ? v.slice(0, 5) + '-' + v.slice(5) : v;
		clearTimeout(cepTimer);
		if (v.length !== 8) return;
		cepTimer = setTimeout(() => buscarCep(v), 400);
	});

	async function buscarCep(cep) {
		setCepMsg('Buscando CEP...', false);
		try {
			const res = await fetch('https://viacep.com.br/ws/' + cep + '/json/');
			const data = await res.json();
			if (data.erro) {
				setCepMsg('CEP não encontrado.', true);
				return;
			}
			el('rua').value = data.logradouro || '';
			el('bairro').value = data.bairro || '';
			el('cidade').value = data.localidade || '';
			el('uf').value = (data.uf || '').toUpperCase();
			setCepMsg('Endereço preenchido automaticamente.', false);
			el('numero').focus();
		} catch {
			setCepMsg('Erro ao consultar CEP. Tente de novo.', true);
		}
	}

	function validar() {
		const campos = [
			['cep', 'Informe o CEP'],
			['rua', 'Informe a rua'],
			['numero', 'Informe o número'],
			['bairro', 'Informe o bairro'],
			['cidade', 'Informe a cidade'],
			['uf', 'Informe o UF'],
			['nome', 'Informe seu nome'],
			['cpf', 'Informe o CPF'],
			['telefone', 'Informe o WhatsApp'],
		];
		for (const [id, msg] of campos) {
			if (!el(id).value.trim()) return msg;
		}
		if (digits(el('cpf').value).length !== 11) return 'CPF inválido';
		if (digits(el('telefone').value).length < 10) return 'Telefone inválido';
		return null;
	}

	function showErro(msg) {
		const e = el('erro');
		e.textContent = msg;
		e.classList.add('show');
	}

	el('btn-pagar').addEventListener('click', async () => {
		el('erro').classList.remove('show');
		const err = validar();
		if (err) {
			showErro(err);
			return;
		}

		const total = atualizarTotais();
		const id = 'acai_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
		const tipo = document.querySelector('input[name="tipo_entrega"]:checked').value;

		const checkout = {
			identifier: id,
			amount: total,
			productType: 'acai-carrinho',
			productName: itens.map((i) => i.nome).join(' | ').slice(0, 180),
			client: {
				name: el('nome').value.trim(),
				document: digits(el('cpf').value),
				phone: digits(el('telefone').value),
				email: el('email').value.trim(),
			},
			tracking: utmParams(),
			entrega: { tipo, taxa: taxaEntrega() },
			endereco: {
				cep: digits(el('cep').value),
				rua: el('rua').value.trim(),
				numero: el('numero').value.trim(),
				complemento: el('complemento').value.trim(),
				bairro: el('bairro').value.trim(),
				cidade: el('cidade').value.trim(),
				uf: el('uf').value.trim().toUpperCase(),
			},
			pedido: { itens },
		};

		el('btn-pagar').disabled = true;
		el('btn-pagar').textContent = 'Gerando PIX...';

		try {
			const res = await fetch(API + '?action=create_pix', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					identifier: checkout.identifier,
					amount: checkout.amount,
					productType: checkout.productType,
					productName: checkout.productName,
					client: checkout.client,
					tracking: checkout.tracking,
				}),
			});
			const data = await res.json();
			if (!data.ok || !data.pix?.code) {
				throw new Error(data.error || 'Não foi possível gerar o PIX.');
			}
			localStorage.setItem(
				'acai_pix',
				JSON.stringify({
					...data,
					checkout,
					criadoEm: new Date().toISOString(),
				})
			);
			window.location.href = '../pix/index.html';
		} catch (e) {
			showErro(e.message || 'Erro ao gerar PIX.');
			el('btn-pagar').disabled = false;
			el('btn-pagar').textContent = 'Gerar PIX e finalizar';
		}
	});
})();