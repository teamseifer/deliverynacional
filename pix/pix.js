(function () {
	const API = '/api/gateway';

	function brl(n) {
		return Number(n).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
	}

	let pix;
	try {
		pix = JSON.parse(localStorage.getItem('acai_pix') || 'null');
	} catch {
		pix = null;
	}
	if (!pix || !pix.pix?.code) {
		window.location.replace('../checkout/index.html');
		return;
	}

	const code = pix.pix.code;
	const txId = pix.transactionId || '';
	const total = pix.amount || pix.checkout?.amount || 0;

	document.getElementById('pix-valor').textContent = brl(total);
	document.getElementById('pix-code').textContent = code;
	new QRCode(document.getElementById('qr'), {
		text: code,
		width: 200,
		height: 200,
		correctLevel: QRCode.CorrectLevel.M,
	});

	document.getElementById('btn-copy').onclick = async () => {
		try {
			await navigator.clipboard.writeText(code);
			document.getElementById('btn-copy').textContent = 'Copiado!';
			setTimeout(() => {
				document.getElementById('btn-copy').textContent = 'Copiar código PIX';
			}, 2000);
		} catch {
			alert('Copie manualmente o código acima.');
		}
	};

	function marcarPago() {
		document.getElementById('paid-ok').classList.add('show');
		document.getElementById('pix-err').textContent = '';
		setTimeout(() => {
			window.location.href = '../obrigado/index.html';
		}, 2500);
	}

	async function verificar() {
		if (!txId) return;
		try {
			const res = await fetch(API + '?action=check_status&id=' + encodeURIComponent(txId));
			const data = await res.json();
			if (data.status === 'PAID' || data.status === 'PAID' || data.payedAt) {
				marcarPago();
				return true;
			}
		} catch (_) {}
		return false;
	}

	document.getElementById('btn-check').onclick = async () => {
		const ok = await verificar();
		if (!ok) {
			document.getElementById('pix-err').textContent =
				'Pagamento ainda não identificado. Aguarde alguns segundos após pagar no app do banco.';
		}
	};

	setInterval(verificar, 8000);
})();