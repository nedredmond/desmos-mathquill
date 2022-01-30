class DOMFragment {
  private ends: Ends<ChildNode> | undefined;

  static create(
    first?: ChildNode | undefined,
    last?: ChildNode | undefined
  ): DOMFragment {
    if (arguments.length === 1) last = first;
    pray('No half-empty DOMFragments', !!first === !!last);
    const out = new DOMFragment(first, last);
    let maybeLast: ChildNode | undefined;
    out.eachNode((el) => (maybeLast = el));
    pray('last is a forward sibling of first', maybeLast === last);
    return out;
  }

  private constructor(
    first?: ChildNode | undefined,
    last?: ChildNode | undefined
  ) {
    if (arguments.length === 1) last = first;
    if (!first || !last) return;
    this.ends = { [L]: first, [R]: last };
  }

  isEmpty(): boolean {
    return this.ends === undefined;
  }

  /**
   * Return a new `DOMFragment` spanning this fragment and `sibling`
   * fragment. Does not perform any DOM operations.
   *
   * Asserts that `sibling` is either empty or a forward sibling of
   * `this`.
   */
  join(sibling: DOMFragment) {
    if (!this.ends) return sibling;
    if (!sibling.ends) return this;
    // Note, purposely using factory here instead of private contructor
    // to verify that sibling is in fact a sibling of this
    return DOMFragment.create(this.ends[L], sibling.ends[R]);
  }

  /**
   * Return the single DOM Node represented by this fragment.
   *
   * Asserts that this fragment contains exactly one node.
   */
  one(): ChildNode {
    pray(
      'Fragment has a single node',
      this.ends && this.ends[L] === this.ends[R]
    );
    return this.ends[L] as ChildNode;
  }

  /**
   * Return the single DOM Element represented by this fragment.
   *
   * Asserts that this fragment contains exactly one node, and that node
   * is an Element node.
   */
  oneElement(): HTMLElement {
    const el = this.one();
    pray('Node is an Element', el.nodeType === Node.ELEMENT_NODE);
    return el as HTMLElement;
  }

  /**
   * Return the single DOM Text node represented by this fragment.
   *
   * Asserts that this fragment contains exactly one node, and that node
   * is a Text node
   */
  oneText(): Text {
    const el = this.one();
    pray('Node is Text', el.nodeType === Node.TEXT_NODE);
    return el as Text;
  }

  eachNode(cb: (el: ChildNode) => void): DOMFragment {
    if (!this.ends) return this;
    const stop = this.ends[R];
    for (
      let node: ChildNode = this.ends[L], next: ChildNode;
      node;
      node = next
    ) {
      // Note, this loop is organized in a slightly tricky way in order
      // cache "next" before calling the callback. This is done because
      // the callback could mutate node.nextSibling (e.g. by moving the
      // node to a documentFragment, like toDocumentFragment does).
      //
      // It's still possible to break this iteration by messing with
      // forward siblings of node in the callback, although it's
      // probably rare to want to do that. Perhaps this means "each" is
      // too dangerous to have as a public method.
      next = node.nextSibling!;
      cb(node);
      if (node === stop) break;
    }
    return this;
  }

  eachElement(cb: (el: HTMLElement) => void): DOMFragment {
    this.eachNode((el) => {
      if (el.nodeType === Node.ELEMENT_NODE) cb(el as HTMLElement);
    });
    return this;
  }

  text() {
    let accum = '';
    this.eachNode((node) => {
      accum += node.textContent || '';
    });
    return accum;
  }

  toElementArray() {
    const accum: HTMLElement[] = [];
    this.eachElement((el) => accum.push(el));
    return accum;
  }

  toDocumentFragment() {
    const frag = document.createDocumentFragment();
    this.eachNode((el) => frag.appendChild(el));
    return frag;
  }

  toJQ(): $ {
    return $(this.toElementArray() as HTMLElement[]);
  }

  insertBefore(el: ChildNode) {
    if (!this.ends) return this;

    const parent = el.parentNode;
    pray('parent is defined', parent);
    parent.insertBefore(this.toDocumentFragment(), el);
    return this;
  }

  insertAfter(el: ChildNode) {
    if (!this.ends) return this;

    const parent = el.parentNode;
    pray('parent is defined', parent);
    parent.insertBefore(this.toDocumentFragment(), el.nextSibling);
    return this;
  }

  /**
   * Append children to the node represented by this fragment.
   *
   * Asserts that this fragment contains exactly one element.
   */
  append(children: DOMFragment) {
    if (!children.ends) return this;
    const el = this.one();
    el.appendChild(children.toDocumentFragment());
    return this;
  }

  /**
   * Prepend children to the node represented by this fragment.
   *
   * Asserts that this fragment contains exactly one element.
   */
  prepend(children: DOMFragment) {
    if (!children.ends) return this;
    const el = this.one();
    el.insertBefore(children.toDocumentFragment(), el.firstChild);
    return this;
  }

  appendTo(el: ChildNode) {
    if (!this.ends) return this;
    el.appendChild(this.toDocumentFragment());
    return this;
  }

  prependTo(el: ChildNode) {
    if (!this.ends) return this;
    el.insertBefore(this.toDocumentFragment(), el.firstChild);
    return this;
  }

  parent() {
    if (!this.ends) return this;
    const parent = this.ends[L].parentNode;
    if (!parent) return new DOMFragment();
    return new DOMFragment(parent as unknown as ChildNode);
  }

  wrapAll(el: ChildNode) {
    if (!this.ends) return this;
    const parent = this.ends[L].parentNode;
    const next = this.ends[R].nextSibling;
    this.appendTo(el);
    if (parent) {
      parent.insertBefore(el, next);
    }
    return this;
  }

  /**
   * Replace the node represented by this fragment with the given
   * fragment.
   *
   * Asserts that this fragment contains exactly one element.
   */
  replaceWith(children: DOMFragment) {
    const el = this.one();
    const parent = el.parentNode;
    pray('parent is defined', parent);
    parent.replaceChild(children.toDocumentFragment(), el);
    return this;
  }

  /**
   * Return the children (including text and comment nodes) of the node
   * represented by this fragment.
   *
   * Asserts that this fragment contains exactly one element.
   *
   * Note, because this includes text and comment nodes, this is more
   * like jQuery's .contents() than jQuery's .children()
   */
  children() {
    const el = this.one();
    const first = el.firstChild;
    const last = el.lastChild;
    return first && last ? new DOMFragment(first, last) : new DOMFragment();
  }

  /**
   * Return the nth Element node of this collection, or undefined if
   * there is no nth Element. Skips Nodes that are not Elements (e.g.
   * Text and Comment nodes).
   *
   * Analogous to jQuery's array indexing syntax, or jQuery's .get()
   * with positive arguments.
   */
  nthElement(n: number): HTMLElement | undefined {
    if (!this.ends) return undefined;
    let current: ChildNode | null = this.ends[L];
    while (current) {
      // Only count element nodes
      if (current.nodeType === Node.ELEMENT_NODE) {
        if (n <= 0) return current as HTMLElement;
        n -= 1;
      }
      if (current === this.ends[R]) return undefined;
      current = current.nextSibling;
    }
    return undefined;
  }

  /**
   * Return the first Element node of this fragment, or undefined if
   * the fragment is empty. Skips Nodes that are not Elements (e.g.
   * Text and Comment nodes).
   */
  firstElement() {
    return this.nthElement(0);
  }

  /**
   * Return the first Element node of this fragment, or undefined if
   * the fragment is empty. Skips Nodes that are not Elements (e.g.
   * Text and Comment nodes).
   */
  lastElement(): HTMLElement | undefined {
    if (!this.ends) return undefined;
    let current: ChildNode | null = this.ends[R];
    while (current) {
      // Only count element nodes
      if (current.nodeType === Node.ELEMENT_NODE) {
        return current as HTMLElement;
      }
      if (current === this.ends[L]) return undefined;
      current = current.previousSibling;
    }
    return undefined;
  }

  /**
   * Return a new fragment holding the first Element node of this
   * fragment, or an empty fragment if this fragment is empty. Skips
   * Nodes that are not Elements (e.g. Text and Comment nodes).
   */
  first() {
    return new DOMFragment(this.firstElement());
  }

  /**
   * Return a new fragment holding the last Element node of this
   * fragment, or an empty fragment if this fragment is empty. Skips
   * Nodes that are not Elements (e.g. Text and Comment nodes).
   */
  last() {
    return new DOMFragment(this.lastElement());
  }

  /**
   * Return a new fragment holding the nth Element node of this
   * fragment, or an empty fragment if there is no nth node of this
   * fragment. Skips Nodes that are not Elements (e.g. Text and Comment
   * nodes).
   */
  eq(n: number) {
    return new DOMFragment(this.nthElement(n));
  }

  /**
   * Return a new fragment beginning with the nth Element node of this
   * fragment, and ending with the same end as this fragment, or an
   * empty fragment if there is no nth node in this fragment. Skips
   * Nodes that are not Elements (e.g. Text and Comment nodes).
   */
  slice(n: number) {
    if (!this.ends) return this;
    const el = this.nthElement(n);
    if (!el) return new DOMFragment();
    return new DOMFragment(el, this.ends[R]);
  }

  /**
   * Return a new fragment containing the next Element after the Node
   * represented by this fragment, or an empty fragment if there is no
   * next Element. Skips Nodes that are not Elements (e.g. Text and
   * Comment nodes).
   *
   * Asserts that this fragment contains exactly one element.
   */
  next() {
    let current: ChildNode | null = this.one();
    while (current) {
      current = current.nextSibling;
      if (current && current.nodeType === Node.ELEMENT_NODE)
        return new DOMFragment(current);
    }
    return new DOMFragment();
  }

  /**
   * Return a new fragment containing the previousElement after the Node
   * represented by this fragment, or an empty fragment if there is no
   * previous Element. Skips Nodes that are not Elements (e.g. Text and
   * Comment nodes).
   *
   * Asserts that this fragment contains exactly one element.
   */
  prev() {
    let current: ChildNode | null = this.one();
    while (current) {
      current = current.previousSibling;
      if (current && current.nodeType === Node.ELEMENT_NODE)
        return new DOMFragment(current);
    }
    return new DOMFragment();
  }

  /**
   * Remove all children of every Element Node in the fragment. Skips
   * Nodes that are not Elements (e.g. Text and Comment nodes).
   */
  empty() {
    // TODO the corresponding jQuery methods clean up some internal
    // references before removing elements from the DOM. That won't
    // matter once jQuery is totally gone, but until then, this may
    // introduce memory leaks
    this.eachElement((el) => {
      el.textContent = '';
    });
    return this;
  }

  /**
   * Remove every node in the fragment from the DOM.
   */
  remove() {
    // TODO the corresponding jQuery methods clean up some internal
    // references before removing elements from the DOM. That won't
    // matter once jQuery is totally gone, but until then, this may
    // introduce memory leaks

    // Note, removing the elements by moving them to a document fragment
    // because this way their sibling references stay intact. This is
    // important if we want to reattach them somewhere else later
    this.toDocumentFragment();
    return this;
  }

  /**
   * Remove every node in the fragment from the DOM. Alias of remove.
   *
   * Note: jQuery makes a distinction between detach() and remove().
   * remove() cleans up internal references, and detach() does not.
   */
  detach() {
    // In jQuery, detach() is similar to remove() but it does not clean
    // up internal references. Here they're aliases, but I'm leaving
    // this as a separate method for the moment to keep track of where
    // mathquill did one vs the other.
    return this.remove();
  }

  /**
   * Insert this fragment either just before or just after `sibling`
   * fragment according to the direction specified by `dir`.
   *
   * Asserts `sibling` is not empty.
   */
  insDirOf(dir: Direction, sibling: DOMFragment): DOMFragment {
    if (!this.ends) return this;

    pray('new sibling is not empty', sibling.ends);
    const el = sibling.ends[dir];
    return dir === L ? this.insertBefore(el) : this.insertAfter(el);
  }

  /**
   * Insert this fragment into `el` either at the beginning or end of
   * its children, according to the direction specified by `dir`.
   */
  insAtDirEnd(dir: Direction, el: ChildNode): DOMFragment {
    return dir === L ? this.prependTo(el) : this.appendTo(el);
  }
}

function jQToDOMFragment(jQ: $) {
  if (jQ.length === 0) return DOMFragment.create();
  if (jQ.length === 1) return DOMFragment.create(jQ[0]);

  for (let i = 0; i < jQ.length - 1; i++) {
    const el = jQ[i];
    const nextEl = jQ[i + 1];
    pray(
      'jQToDOMFragment expects jQ to be a collection of siblings',
      DOMFragment.create(el).next().one() === nextEl
    );
  }

  return DOMFragment.create(jQ[0], jQ[jQ.length - 1]);
}
