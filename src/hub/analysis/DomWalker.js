
/**
 * Phase 2: DomWalker
 * O(N) Hybrid TreeWalker for Shadow DOM Traversal.
 * 
 * Strategy:
 * 1. Use TreeWalker for fast main-document traversal.
 * 2. Detect 'shadowRoot' on elements.
 * 3. Recursively create new TreeWalkers for shadow roots.
 * 
 * Complexity: O(N) - Visits each node exactly once.
 */
class DomWalker {
    /**
     * Traverses the DOM tree efficiently, piercing Shadow DOMs.
     * Complexity: O(N) - Visits each node exactly once.
     * Strategy: Native TreeWalker for fast linear traversal, 
     * recursive roots for Shadow DOM entry.
     * @param {Node} root 
     * @param {Function} callback 
     */
    static walk(root, callback) {
        if (!root) return;

        const walker = document.createTreeWalker(
            root,
            NodeFilter.SHOW_ELEMENT,
            { acceptNode: () => NodeFilter.FILTER_ACCEPT }
        );

        let node = walker.currentNode;
        while (node) {
            callback(node);

            // Pierce Shadow DOM
            // Note: We use the native walker for the sub-tree, 
            // but we must manually enter shadow roots.
            if (node.shadowRoot) {
                DomWalker.walk(node.shadowRoot, callback);
            }

            node = walker.nextNode();
        }
    }
}

module.exports = { DomWalker };
