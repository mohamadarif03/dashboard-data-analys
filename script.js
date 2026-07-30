document.addEventListener('DOMContentLoaded', () => {

    // Sidebar has been removed.

    // ===== PLOTLY COMMON SETTINGS =====
    const chartLayout = {
        font: { family: 'Inter, sans-serif', color: '#475569', size: 12 },
        paper_bgcolor: 'transparent',
        plot_bgcolor: 'transparent',
        margin: { l: 50, r: 20, t: 20, b: 50 },
        showlegend: false,
        xaxis: { gridcolor: 'rgba(37,99,235,0.06)', zeroline: false, linecolor: '#E2E8F0' },
        yaxis: { gridcolor: 'rgba(37,99,235,0.06)', zeroline: false, linecolor: '#E2E8F0' }
    };
    const config = { displayModeBar: false, responsive: true };

    // ===== FEATURE ENGINEERING (sama persis dengan ipynb) =====
    function borEfficiencyScore(bor) {
        if (bor >= 60 && bor <= 85) return 100;
        else if (bor < 60) return Math.max(0, 100 - (60 - bor) * 2.5);
        else return Math.max(0, 100 - (bor - 85) * 3);
    }

    function categorizeDigital(score) {
        if (score >= 80) return 'Tinggi';
        else if (score >= 60) return 'Sedang';
        else if (score >= 40) return 'Rendah';
        else return 'Sangat Rendah';
    }

    // Normalize kepemilikan casing (dataset has inconsistent casing like 'SWASTA' vs 'Swasta')
    function normalizeKepemilikan(val) {
        if (!val) return 'Tidak Diketahui';
        const v = val.trim().toLowerCase();
        if (v === 'swasta') return 'Swasta';
        if (v.includes('daerah')) return 'Pemerintah Daerah';
        if (v.includes('pusat')) return 'Pemerintah Pusat';
        if (v.includes('tni') || v.includes('polri')) return 'TNI/POLRI';
        if (v === 'bumn') return 'BUMN';
        return val;
    }

    function enrichData(data) {
        // Normalize kepemilikan first
        data.forEach(r => {
            r.kepemilikan = normalizeKepemilikan(r.kepemilikan);
        });

        // Compute min/max from full dataset for normalization (same as ipynb)
        const losVals = data.map(r => r.rata_rata_lama_rawat_hari).filter(v => isFinite(v));
        const respVals = data.map(r => r.rata_rata_waktu_respons_rujukan_menit).filter(v => isFinite(v));
        const losMin = Math.min(...losVals), losMax = Math.max(...losVals);
        const respMin = Math.min(...respVals), respMax = Math.max(...respVals);

        data.forEach(r => {
            r.skor_bor_efisiensi = borEfficiencyScore(r.tingkat_keterisian_tempat_tidur_persen);
            r.skor_los_efisiensi = 100 - ((r.rata_rata_lama_rawat_hari - losMin) / (losMax - losMin) * 100);
            r.skor_respons_efisiensi = 100 - ((r.rata_rata_waktu_respons_rujukan_menit - respMin) / (respMax - respMin) * 100);
            r.skor_efisiensi_operasional = r.skor_bor_efisiensi * 0.35 + r.skor_los_efisiensi * 0.30 + r.skor_respons_efisiensi * 0.35;
            r.kategori_digital = categorizeDigital(r.skor_kematangan_digital);
        });

        const medDigital = median(data.map(r => r.skor_kematangan_digital));
        const medRespons = median(data.map(r => r.rata_rata_waktu_respons_rujukan_menit).filter(v => isFinite(v)));
        data.forEach(r => {
            r.kuadran = (r.skor_kematangan_digital < medDigital && r.rata_rata_waktu_respons_rujukan_menit > medRespons) ? 'Krisis' : 'Lainnya';
        });

        return data;
    }

    function median(arr) {
        const s = [...arr].sort((a, b) => a - b);
        const mid = Math.floor(s.length / 2);
        return s.length % 2 !== 0 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
    }

    function mean(arr) {
        const clean = arr.filter(v => v !== null && v !== undefined && isFinite(v));
        return clean.length ? clean.reduce((a, b) => a + b, 0) / clean.length : 0;
    }

    // Enrich full dataset
    const allData = enrichData([...RAW_DATA]);

    // ===== FILTER STATE =====
    let filterKelas = 'all';
    let filterKepemilikan = 'all';
    let filterRME = 'all';

    const kepemilikanMap = {
        'all': null,
        'swasta': 'Swasta',
        'pemda': 'Pemerintah Daerah',
        'tni': 'TNI/POLRI',
        'pusat': 'Pemerintah Pusat',
        'bumn': 'BUMN'
    };

    function getFilteredData() {
        return allData.filter(r => {
            if (filterKelas !== 'all' && r.kelas_rumah_sakit !== filterKelas) return false;
            if (filterKepemilikan !== 'all') {
                const target = kepemilikanMap[filterKepemilikan];
                if (target && r.kepemilikan !== target) return false;
            }
            if (filterRME !== 'all') {
                if (filterRME === 'ya' && r.status_implementasi_rme !== 'Ya') return false;
                if (filterRME === 'tidak' && r.status_implementasi_rme !== 'Tidak') return false;
            }
            return true;
        });
    }

    // ===== FILTER EVENT LISTENERS =====
    document.querySelectorAll('#filterKelas .chip').forEach(chip => {
        chip.addEventListener('click', () => {
            document.querySelectorAll('#filterKelas .chip').forEach(c => c.classList.remove('active'));
            chip.classList.add('active');
            filterKelas = chip.dataset.val;
            updateDashboard();
        });
    });

    document.querySelectorAll('#filterKepemilikan .chip').forEach(chip => {
        chip.addEventListener('click', () => {
            document.querySelectorAll('#filterKepemilikan .chip').forEach(c => c.classList.remove('active'));
            chip.classList.add('active');
            filterKepemilikan = chip.dataset.val;
            updateDashboard();
        });
    });

    document.querySelectorAll('#filterRME .chip').forEach(chip => {
        chip.addEventListener('click', () => {
            document.querySelectorAll('#filterRME .chip').forEach(c => c.classList.remove('active'));
            chip.classList.add('active');
            filterRME = chip.dataset.val;
            updateDashboard();
        });
    });

    // ===== MAIN UPDATE FUNCTION =====
    function updateDashboard() {
        const data = getFilteredData();
        updateKPIs(data);
        updateMiniStats(data);
        renderChartProvinsi(data);
        renderChartKategori(data);
        renderChartKelas(data);
        renderChartScatter(data);
    }

    // ===== UPDATE KPIs =====
    function updateKPIs(data) {
        document.getElementById('kpiTotal').textContent = data.length;
        document.getElementById('kpiDigital').textContent = mean(data.map(r => r.skor_kematangan_digital)).toFixed(1);

        const satuSehatPct = data.length ? (data.filter(r => r.status_terhubung_satusehat === 'Ya').length / data.length * 100) : 0;
        document.getElementById('kpiSatu').textContent = satuSehatPct.toFixed(1) + '%';

        document.getElementById('kpiEff').textContent = mean(data.map(r => r.skor_efisiensi_operasional)).toFixed(1);
        document.getElementById('kpiCrisis').textContent = data.filter(r => r.kuadran === 'Krisis').length;
        document.getElementById('kpiTele').textContent = Math.round(mean(data.map(r => r.kunjungan_telemedicine_per_bulan))) + '/bln';
    }

    // ===== UPDATE MINI STATS =====
    function updateMiniStats(data) {
        const stats = document.querySelectorAll('.mini-stat strong');
        stats[0].textContent = mean(data.map(r => r.tingkat_keterisian_tempat_tidur_persen)).toFixed(1) + '%';
        stats[1].textContent = mean(data.map(r => r.rata_rata_lama_rawat_hari)).toFixed(1) + ' hari';
        stats[2].textContent = mean(data.map(r => r.rata_rata_waktu_respons_rujukan_menit)).toFixed(1) + ' menit';
        stats[3].textContent = data.filter(r => r.status_implementasi_rme === 'Ya').length + ' RS';
        stats[4].textContent = data.filter(r => r.status_implementasi_rme === 'Tidak').length + ' RS';
    }

    // ===== CHART 1: Provinsi Grouped Bar =====
    function renderChartProvinsi(data) {
        // Group by provinsi
        const provMap = {};
        data.forEach(r => {
            if (!provMap[r.provinsi]) provMap[r.provinsi] = { digital: [], eff: [] };
            provMap[r.provinsi].digital.push(r.skor_kematangan_digital);
            provMap[r.provinsi].eff.push(r.skor_efisiensi_operasional);
        });

        let provArr = Object.entries(provMap).map(([name, vals]) => ({
            name,
            avgDigital: mean(vals.digital),
            avgEff: mean(vals.eff)
        }));

        // Sort by digital score desc, take top 10
        provArr.sort((a, b) => b.avgDigital - a.avgDigital);
        provArr = provArr.slice(0, 10);

        Plotly.react('chartProvinsi', [
            {
                x: provArr.map(p => p.name), y: provArr.map(p => p.avgDigital),
                name: 'Skor Digital', type: 'bar', marker: { color: '#3B82F6' }
            },
            {
                x: provArr.map(p => p.name), y: provArr.map(p => p.avgEff),
                name: 'Efisiensi', type: 'bar', marker: { color: '#06B6D4' }
            }
        ], {
            ...chartLayout,
            barmode: 'group',
            showlegend: true,
            legend: { orientation: 'h', y: 1.12, x: 1, xanchor: 'right', font: { color: '#64748B' } },
            margin: { l: 40, r: 20, t: 30, b: 80 },
            xaxis: { ...chartLayout.xaxis, tickangle: -30 }
        }, config);
    }

    // ===== CHART 2: Kategori Digital Donut =====
    function renderChartKategori(data) {
        const catCount = { 'Tinggi': 0, 'Sedang': 0, 'Rendah': 0, 'Sangat Rendah': 0 };
        data.forEach(r => { catCount[r.kategori_digital]++; });

        Plotly.react('chartKategori', [{
            values: [catCount['Tinggi'], catCount['Sedang'], catCount['Rendah'], catCount['Sangat Rendah']],
            labels: ['Tinggi', 'Sedang', 'Rendah', 'Sangat Rendah'],
            type: 'pie', hole: 0.6,
            marker: { colors: ['#10B981', '#3B82F6', '#F59E0B', '#EF4444'] },
            textinfo: 'percent+label', textposition: 'outside',
            textfont: { color: '#64748B', size: 11 },
            hoverinfo: 'label+value+percent',
            pull: [0.03, 0, 0, 0],
            automargin: true
        }], {
            ...chartLayout,
            margin: { l: 40, r: 40, t: 40, b: 40 },
            annotations: [{
                text: `<b>${data.length}</b><br>RS`,
                showarrow: false,
                font: { size: 18, color: '#0F172A' },
                x: 0.5, y: 0.5
            }]
        }, config);
    }

    // ===== CHART 3: Kelas RS Bar + Line =====
    function renderChartKelas(data) {
        const kelasMap = {};
        data.forEach(r => {
            if (!kelasMap[r.kelas_rumah_sakit]) kelasMap[r.kelas_rumah_sakit] = { count: 0, digital: [] };
            kelasMap[r.kelas_rumah_sakit].count++;
            kelasMap[r.kelas_rumah_sakit].digital.push(r.skor_kematangan_digital);
        });

        const kelasOrder = ['A', 'B', 'C', 'D'];
        const kelasLabels = kelasOrder.filter(k => kelasMap[k]);
        const kelasCount = kelasLabels.map(k => kelasMap[k].count);
        const kelasDigital = kelasLabels.map(k => +mean(kelasMap[k].digital).toFixed(1));

        Plotly.react('chartKelas', [
            {
                x: kelasLabels, y: kelasCount,
                name: 'Jumlah RS', type: 'bar',
                marker: { color: ['#8B5CF6', '#3B82F6', '#06B6D4', '#10B981'].slice(0, kelasLabels.length) },
                text: kelasCount, textposition: 'auto',
                textfont: { color: '#1E293B', size: 13 },
                hovertemplate: 'Kelas %{x}<br>Jumlah: %{y} RS<extra></extra>'
            },
            {
                x: kelasLabels, y: kelasDigital,
                name: 'Avg Digital Score', type: 'scatter',
                mode: 'lines+markers+text', yaxis: 'y2',
                marker: { color: '#F59E0B', size: 10 },
                line: { color: '#F59E0B', width: 2 },
                text: kelasDigital.map(v => v.toFixed(1)),
                textposition: 'top center',
                textfont: { color: '#F59E0B', size: 11 },
                hovertemplate: 'Kelas %{x}<br>Avg Digital: %{y:.1f}<extra></extra>'
            }
        ], {
            ...chartLayout,
            showlegend: true,
            legend: { orientation: 'h', y: 1.15, x: 0.5, xanchor: 'center', font: { color: '#64748B', size: 11 } },
            margin: { l: 40, r: 50, t: 35, b: 40 },
            yaxis: { ...chartLayout.yaxis, title: { text: 'Jumlah RS', font: { size: 11, color: '#64748B' } } },
            yaxis2: {
                overlaying: 'y', side: 'right', showgrid: false,
                title: { text: 'Avg Digital Score', font: { size: 11, color: '#F59E0B' } },
                tickfont: { color: '#F59E0B' },
                range: [Math.max(0, Math.min(...kelasDigital) - 15), Math.max(...kelasDigital) + 10]
            }
        }, config);
    }

    // ===== CHART 4: Scatter Anggaran IT vs Digital =====
    function renderChartScatter(data) {
        // Filter out NaN anggaran values
        const validData = data.filter(r => isFinite(r.anggaran_it_tahunan_juta_rupiah));

        // Group by kelas for coloring
        const kelasColors = { 'A': '#8B5CF6', 'B': '#3B82F6', 'C': '#06B6D4', 'D': '#10B981' };
        const traces = {};
        validData.forEach(r => {
            const k = r.kelas_rumah_sakit;
            if (!traces[k]) traces[k] = { x: [], y: [] };
            traces[k].x.push(r.anggaran_it_tahunan_juta_rupiah);
            traces[k].y.push(r.skor_kematangan_digital);
        });

        const scatterTraces = Object.entries(traces).map(([kelas, vals]) => ({
            x: vals.x, y: vals.y,
            name: `Kelas ${kelas}`, type: 'scatter', mode: 'markers',
            marker: { color: kelasColors[kelas] || '#94A3B8', size: 7, opacity: 0.7 },
            hovertemplate: `Kelas ${kelas}<br>Anggaran: %{x:.0f} Juta<br>Skor: %{y:.1f}<extra></extra>`
        }));

        // Calculate correlation (only valid data)
        const xArr = validData.map(r => r.anggaran_it_tahunan_juta_rupiah);
        const yArr = validData.map(r => r.skor_kematangan_digital);
        const corr = pearsonCorr(xArr, yArr);

        Plotly.react('chartScatter', scatterTraces, {
            ...chartLayout,
            showlegend: true,
            legend: { orientation: 'h', y: 1.15, x: 0.5, xanchor: 'center', font: { color: '#64748B', size: 11 } },
            margin: { l: 60, r: 30, t: 30, b: 60 },
            xaxis: { ...chartLayout.xaxis, title: { text: 'Anggaran IT (Juta Rp)', font: { size: 11, color: '#64748B' } }, automargin: true },
            yaxis: { ...chartLayout.yaxis, title: { text: 'Skor Kematangan Digital', font: { size: 11, color: '#64748B' } }, automargin: true },
            annotations: [{
                text: `Korelasi: r = ${corr.toFixed(3)}`,
                showarrow: false,
                xref: 'paper', yref: 'paper', x: 0.98, y: 0.02,
                font: { color: '#D97706', size: 12 },
                bgcolor: 'rgba(255,255,255,0.9)',
                borderpad: 6, bordercolor: '#F59E0B', borderwidth: 1
            }]
        }, config);
    }

    function pearsonCorr(x, y) {
        const n = x.length;
        if (n < 2) return 0;
        const mx = mean(x), my = mean(y);
        let num = 0, dx2 = 0, dy2 = 0;
        for (let i = 0; i < n; i++) {
            const dx = x[i] - mx, dy = y[i] - my;
            num += dx * dy;
            dx2 += dx * dx;
            dy2 += dy * dy;
        }
        const denom = Math.sqrt(dx2 * dy2);
        return denom === 0 ? 0 : num / denom;
    }

    // ===== RESIZE HANDLER =====
    window.addEventListener('resize', () => {
        ['chartProvinsi', 'chartKategori', 'chartKelas', 'chartScatter'].forEach(id => {
            Plotly.Plots.resize(id);
        });
    });

    // ===== INITIAL RENDER =====
    updateDashboard();
});
