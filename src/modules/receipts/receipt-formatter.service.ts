export type PaperWidth = '80mm' | '58mm';

export class ReceiptFormatterService {
  /**
   * Column width for 80mm (~48 columns) vs 58mm (~32 columns) thermal printers.
   */
  public static getWidth(paperWidth: PaperWidth): number {
    return paperWidth === '58mm' ? 32 : 48;
  }

  /**
   * Format money string with currency symbol/code.
   */
  public static formatMoney(amount: number, currency: string = 'USD'): string {
    const formattedNum = Number(amount || 0).toFixed(2);
    if (currency === 'USD') return `$${formattedNum}`;
    if (currency === 'PKR') return `Rs. ${formattedNum}`;
    if (currency === 'EUR') return `€${formattedNum}`;
    if (currency === 'GBP') return `£${formattedNum}`;
    return `${currency} ${formattedNum}`;
  }

  /**
   * Wraps text into lines that do not exceed the specified width.
   */
  public static wrapText(text: string, width: number, indent: string = ''): string[] {
    const trimmed = text.trim();
    if (!trimmed) return [];
    if (trimmed.length <= width) return [trimmed];

    const words = trimmed.split(/\s+/);
    const lines: string[] = [];
    let currentLine = '';

    for (const word of words) {
      const testLine = currentLine ? `${currentLine} ${word}` : word;
      if (testLine.length + (lines.length > 0 ? indent.length : 0) <= width) {
        currentLine = testLine;
      } else {
        if (currentLine) {
          lines.push(lines.length > 0 ? `${indent}${currentLine}` : currentLine);
        }
        currentLine = word;
      }
    }

    if (currentLine) {
      lines.push(lines.length > 0 ? `${indent}${currentLine}` : currentLine);
    }

    return lines.map((l) => (l.length > width ? l.slice(0, width) : l));
  }

  /**
   * Centers text within the specified line width. Wraps long text across multiple centered lines.
   */
  public static center(text: string, width: number): string {
    const wrapped = this.wrapText(text, width);
    return wrapped
      .map((line) => {
        const leftPad = Math.max(0, Math.floor((width - line.length) / 2));
        return ' '.repeat(leftPad) + line;
      })
      .join('\n');
  }

  /**
   * Left-aligns and right-aligns two strings on the same line.
   */
  public static leftRight(left: string, right: string, width: number): string {
    const r = right.trim();
    const availableLeft = width - r.length - 1;
    let l = left.trim();
    if (l.length > availableLeft) {
      l = l.slice(0, availableLeft);
    }
    const spaces = Math.max(1, width - l.length - r.length);
    return l + ' '.repeat(spaces) + r;
  }

  /**
   * Produces a divider line (e.g. '------------------------').
   */
  public static divider(width: number, char: string = '-'): string {
    return char.repeat(width);
  }

  /**
   * Formats Customer Receipt data into a clean ASCII thermal slip.
   */
  public static formatCustomerSlip(
    data: Record<string, unknown>,
    paperWidth: PaperWidth = '80mm',
  ): string {
    const width = this.getWidth(paperWidth);
    const lines: string[] = [];

    const restaurant = (data.restaurant as Record<string, unknown>) || {};
    const metadata = (data.metadata as Record<string, unknown>) || {};
    const items = (data.items as Record<string, unknown>[]) || [];
    const totals = (data.totals as Record<string, unknown>) || {};
    const payments = (data.payments as Record<string, unknown>[]) || [];
    const currency = String(restaurant.currency || 'USD');

    // 1. Header Section
    lines.push(this.center(String(restaurant.name || 'RESTAURANT'), width));
    if (restaurant.legalName && restaurant.legalName !== restaurant.name) {
      lines.push(this.center(String(restaurant.legalName), width));
    }
    if (restaurant.address) {
      lines.push(this.center(String(restaurant.address), width));
    }
    if (restaurant.phone) {
      lines.push(this.center(`Tel: ${restaurant.phone}`, width));
    }
    if (restaurant.taxNumber) {
      lines.push(this.center(`Tax / NTN: ${restaurant.taxNumber}`, width));
    }
    if (restaurant.receiptHeader) {
      lines.push(this.divider(width, '-'));
      lines.push(this.center(String(restaurant.receiptHeader), width));
    }

    lines.push(this.divider(width, '='));

    // 2. Receipt Title
    const title = data.isReprint
      ? '*** DUPLICATE RECEIPT / REPRINT ***'
      : data.title
        ? String(data.title)
        : 'CUSTOMER RECEIPT';
    lines.push(this.center(title, width));
    lines.push(this.divider(width, '='));

    // 3. Order Metadata
    lines.push(
      this.leftRight(`Order: ${metadata.orderCode}`, `Type: ${metadata.orderType}`, width),
    );
    lines.push(
      this.leftRight(`Date: ${metadata.formattedDate}`, `Time: ${metadata.formattedTime}`, width),
    );

    if (metadata.tableName) {
      const tableInfo = metadata.zoneName
        ? `${metadata.tableName} (${metadata.zoneName})`
        : String(metadata.tableName);
      lines.push(
        this.leftRight(`Table: ${tableInfo}`, `Guests: ${metadata.guestCount || 1}`, width),
      );
    }

    const tokenVal =
      metadata.tokenNumber ||
      (metadata.orderType === 'TAKEAWAY' ? metadata.dailySequence : undefined);
    if (tokenVal !== undefined && tokenVal !== null) {
      lines.push(this.leftRight(`Token #: TK-${String(tokenVal).padStart(3, '0')}`, '', width));
    }

    if (metadata.customerName) {
      lines.push(
        this.leftRight(
          `Customer: ${metadata.customerName}`,
          metadata.customerPhone ? String(metadata.customerPhone) : '',
          width,
        ),
      );
    }
    if (metadata.deliveryAddress) {
      const wrappedAddress = this.wrapText(`Address: ${metadata.deliveryAddress}`, width, '  ');
      lines.push(...wrappedAddress);
    }
    if (metadata.cashierName) {
      lines.push(this.leftRight(`Cashier: ${metadata.cashierName}`, '', width));
    }

    lines.push(this.divider(width, '-'));

    // 4. Line Items Table
    lines.push(this.leftRight('ITEM', 'AMOUNT', width));
    lines.push(this.divider(width, '-'));

    for (const it of items) {
      const qty = Number(it.quantity || 1);
      const name = String(it.itemName);
      const totalStr = this.formatMoney(Number(it.lineTotal || 0), currency);

      const itemLine = `${qty}x ${name}`;
      lines.push(this.leftRight(itemLine, totalStr, width));

      if (it.variantName) {
        lines.push(`   (${it.variantName})`);
      }

      if (Array.isArray(it.modifiers) && it.modifiers.length > 0) {
        for (const mod of it.modifiers as Record<string, unknown>[]) {
          const modName = `  + ${mod.modifierOptionName}`;
          const modPrice =
            Number(mod.priceAdjustment || 0) > 0
              ? this.formatMoney(Number(mod.priceAdjustment), currency)
              : '';
          lines.push(this.leftRight(modName, modPrice, width));
        }
      }

      if (it.specialInstructions) {
        const wrappedNotes = this.wrapText(`* Note: ${it.specialInstructions}`, width, '   ');
        lines.push(...wrappedNotes);
      }
    }

    lines.push(this.divider(width, '-'));

    // 5. Totals Breakdown
    lines.push(
      this.leftRight('Subtotal:', this.formatMoney(Number(totals.subtotal || 0), currency), width),
    );

    if (Number(totals.totalDiscount || 0) > 0) {
      lines.push(
        this.leftRight(
          'Discount:',
          `-${this.formatMoney(Number(totals.totalDiscount), currency)}`,
          width,
        ),
      );
    }

    if (Number(totals.taxAmount || 0) > 0 || totals.taxRate) {
      const taxLabel = totals.taxRate ? `Tax (${totals.taxRate}%):` : 'Tax:';
      lines.push(
        this.leftRight(taxLabel, this.formatMoney(Number(totals.taxAmount || 0), currency), width),
      );
    }

    if (Number(totals.serviceChargeAmount || 0) > 0) {
      lines.push(
        this.leftRight(
          'Service Charge:',
          this.formatMoney(Number(totals.serviceChargeAmount), currency),
          width,
        ),
      );
    }

    if (Number(totals.deliveryCharge || 0) > 0) {
      lines.push(
        this.leftRight(
          'Delivery Fee:',
          this.formatMoney(Number(totals.deliveryCharge), currency),
          width,
        ),
      );
    }

    if (Number(totals.packagingCharge || 0) > 0) {
      lines.push(
        this.leftRight(
          'Packaging Fee:',
          this.formatMoney(Number(totals.packagingCharge), currency),
          width,
        ),
      );
    }

    lines.push(this.divider(width, '='));
    lines.push(
      this.leftRight(
        'GRAND TOTAL:',
        this.formatMoney(Number(totals.grandTotal || 0), currency),
        width,
      ),
    );
    lines.push(this.divider(width, '='));

    // 6. Payments
    if (payments.length > 0) {
      lines.push(this.leftRight('PAYMENT BREAKDOWN', '', width));
      for (const p of payments) {
        const brandOrMethod = p.cardBrand ? String(p.cardBrand) : String(p.paymentMethod);
        const methodStr = brandOrMethod + (p.cardLast4 ? ` (x-${p.cardLast4})` : '');
        lines.push(
          this.leftRight(methodStr, this.formatMoney(Number(p.amount || 0), currency), width),
        );
      }
      if (Number(totals.paidAmount || 0) > 0) {
        lines.push(
          this.leftRight(
            'Total Paid:',
            this.formatMoney(Number(totals.paidAmount), currency),
            width,
          ),
        );
      }
      if (Number(totals.changeAmount || 0) > 0) {
        lines.push(
          this.leftRight(
            'Change Returned:',
            this.formatMoney(Number(totals.changeAmount), currency),
            width,
          ),
        );
      }
      if (Number(totals.balanceDue || 0) > 0) {
        lines.push(
          this.leftRight(
            'Balance Due:',
            this.formatMoney(Number(totals.balanceDue), currency),
            width,
          ),
        );
      }
      lines.push(this.divider(width, '-'));
    }

    // 7. Footer
    if (restaurant.receiptFooter) {
      lines.push(this.center(String(restaurant.receiptFooter), width));
    }
    lines.push(this.center('Thank you for dining with us!', width));

    const printedAtFormatted = new Date(String(data.printedAt)).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
    lines.push(this.center(`Printed: ${printedAtFormatted}`, width));

    if (data.isReprint) {
      lines.push(
        this.center(
          `Reprint #${data.reprintCount || 1} - Auth: ${data.reprintedBy || 'Staff'}`,
          width,
        ),
      );
    }

    return lines.join('\n');
  }

  /**
   * Formats Kitchen Order Ticket (KOT) into an ASCII kitchen slip.
   */
  public static formatKitchenSlip(
    data: Record<string, unknown>,
    paperWidth: PaperWidth = '80mm',
  ): string {
    const width = this.getWidth(paperWidth);
    const lines: string[] = [];

    const metadata = (data.metadata as Record<string, unknown>) || {};
    const items = (data.items as Record<string, unknown>[]) || [];

    lines.push(this.divider(width, '*'));
    lines.push(this.center('*** KITCHEN ORDER TICKET (KOT) ***', width));
    if (data.stationName) {
      lines.push(this.center(`STATION: ${String(data.stationName).toUpperCase()}`, width));
    }
    lines.push(this.divider(width, '*'));

    lines.push(
      this.leftRight(`Order: ${metadata.orderCode}`, `Type: ${metadata.orderType}`, width),
    );

    const tokenVal =
      metadata.tokenNumber ||
      (metadata.orderType === 'TAKEAWAY' ? metadata.dailySequence : undefined);
    if (tokenVal) {
      lines.push(this.center(`>>> TOKEN #: TK-${String(tokenVal).padStart(3, '0')} <<<`, width));
    }
    if (metadata.tableName) {
      const tableInfo = metadata.zoneName
        ? `${metadata.tableName} (${metadata.zoneName})`
        : String(metadata.tableName);
      lines.push(
        this.leftRight(`Table: ${tableInfo}`, `Guests: ${metadata.guestCount || 1}`, width),
      );
    }
    lines.push(
      this.leftRight(
        `Time: ${metadata.formattedTime}`,
        `Server: ${metadata.serverName || 'Counter'}`,
        width,
      ),
    );

    if (metadata.notes) {
      lines.push(this.divider(width, '-'));
      const wrappedNotes = this.wrapText(`ORDER NOTE: ${metadata.notes}`, width);
      lines.push(...wrappedNotes);
    }

    lines.push(this.divider(width, '='));
    lines.push(this.leftRight('QTY  ITEM DESCRIPTION', 'STATUS', width));
    lines.push(this.divider(width, '='));

    for (const it of items) {
      const qty = Number(it.quantity || 1);
      const name = String(it.itemName);
      const status = String(it.kitchenStatus || 'PENDING');

      lines.push(this.leftRight(`${qty}x  ${name}`, `[${status}]`, width));

      if (it.variantName) {
        lines.push(`    Portion: ${it.variantName}`);
      }

      if (Array.isArray(it.modifiers) && it.modifiers.length > 0) {
        for (const mod of it.modifiers as Record<string, unknown>[]) {
          lines.push(`    + ${mod.modifierOptionName}`);
        }
      }

      if (it.specialInstructions) {
        const wrappedIns = this.wrapText(
          `** INSTRUCTION: ${it.specialInstructions} **`,
          width,
          '    ',
        );
        lines.push(...wrappedIns);
      }
    }

    lines.push(this.divider(width, '='));
    lines.push(this.center(`Total Items: ${items.length}`, width));
    lines.push(this.divider(width, '*'));

    return lines.join('\n');
  }
}
