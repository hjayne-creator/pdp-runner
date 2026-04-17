import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';

/**
 * Renders a DOM subtree to a multi-page PDF (matches on-screen HTML / CSS).
 */
export async function downloadHtmlElementAsPdf(
  element: HTMLElement,
  filenameBase = 'ai-output-report',
) {
  const canvas = await html2canvas(element, {
    scale: 2,
    useCORS: true,
    logging: false,
    backgroundColor: '#ffffff',
    scrollX: 0,
    scrollY: -window.scrollY,
  });

  const imgData = canvas.toDataURL('image/jpeg', 0.92);
  const pdf = new jsPDF({ unit: 'pt', format: 'letter', orientation: 'portrait' });
  const pdfPageWidth = pdf.internal.pageSize.getWidth();
  const pdfPageHeight = pdf.internal.pageSize.getHeight();
  const margin = 36;
  const imgWidth = pdfPageWidth - 2 * margin;
  const imgHeight = (canvas.height * imgWidth) / canvas.width;
  const usablePageHeight = pdfPageHeight - 2 * margin;

  let heightLeft = imgHeight;
  let position = margin;

  pdf.addImage(imgData, 'JPEG', margin, position, imgWidth, imgHeight);
  heightLeft -= usablePageHeight;

  while (heightLeft > 0) {
    position = heightLeft - imgHeight + margin;
    pdf.addPage();
    pdf.addImage(imgData, 'JPEG', margin, position, imgWidth, imgHeight);
    heightLeft -= usablePageHeight;
  }

  const safe = filenameBase.replace(/[^\w\-]+/g, '_').replace(/_+/g, '_').slice(0, 120);
  pdf.save(`${safe}.pdf`);
}
