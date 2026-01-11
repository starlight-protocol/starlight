#!/usr/bin/env python3
"""
Starlight Protocol Architecture Diagram Generator
Generates a professional architecture diagram with security components
"""

import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
from matplotlib.patches import FancyBboxPatch, FancyArrowPatch
import numpy as np

def create_architecture_diagram():
    fig, ax = plt.subplots(1, 1, figsize=(14, 10))
    ax.set_xlim(0, 14)
    ax.set_ylim(0, 10)
    ax.axis('off')
    
    # Colors
    colors = {
        'intent': '#E3F2FD',
        'hub': '#FFF3E0',
        'security': '#F3E5F5',
        'sentinel': '#E8F5E9',
        'browser': '#FFEBEE',
        'border': '#424242',
        'text': '#212121',
        'arrow': '#616161'
    }
    
    # Title
    ax.text(7, 9.5, 'Starlight Protocol Architecture', 
            fontsize=18, fontweight='bold', ha='center', color=colors['text'])
    ax.text(7, 9.0, 'Enterprise-Grade Autonomous Browser Automation', 
            fontsize=11, ha='center', color='#616161', style='italic')
    
    # Intent Layer
    intent_box = FancyBboxPatch((0.5, 6.5), 3, 1.5, 
                                 boxstyle="round,pad=0.05", 
                                 facecolor=colors['intent'], 
                                 edgecolor=colors['border'],
                                 linewidth=2)
    ax.add_patch(intent_box)
    ax.text(2, 7.25, 'INTENT LAYER', fontsize=12, fontweight='bold', ha='center', color=colors['text'])
    ax.text(2, 6.8, '(Test Scripts)', fontsize=9, ha='center', color='#616161')
    
    # Hub Layer
    hub_box = FancyBboxPatch((5.5, 4), 3, 4), 
    hub_fill = plt.Rectangle((5.5, 4), 3, 4, facecolor=colors['hub'], edgecolor=colors['border'], linewidth=2)
    ax.add_patch(hub_fill)
    ax.text(7, 7.5, 'HUB', fontsize=14, fontweight='bold', ha='center', color=colors['text'])
    ax.text(7, 7.0, 'Orchestrator + Browser Control', fontsize=8, ha='center', color='#616161')
    
    # Security components inside Hub
    security_box1 = FancyBboxPatch((5.7, 6), 2.6, 0.8, 
                                    boxstyle="round,pad=0.03", 
                                    facecolor=colors['security'], 
                                    edgecolor='#7B1FA2',
                                    linewidth=1.5)
    ax.add_patch(security_box1)
    ax.text(7, 6.4, 'JWT Handler', fontsize=9, fontweight='bold', ha='center', color='#7B1FA2')
    ax.text(7, 6.05, '(Authentication)', fontsize=7, ha='center', color='#616161')
    
    security_box2 = FancyBboxPatch((5.7, 5), 2.6, 0.8, 
                                    boxstyle="round,pad=0.03", 
                                    facecolor=colors['security'], 
                                    edgecolor='#7B1FA2',
                                    linewidth=1.5)
    ax.add_patch(security_box2)
    ax.text(7, 5.4, 'Schema Validator', fontsize=9, fontweight='bold', ha='center', color='#7B1FA2')
    ax.text(7, 5.05, '(Input Validation)', fontsize=7, ha='center', color='#616161')
    
    security_box3 = FancyBboxPatch((5.7, 4.1), 2.6, 0.7, 
                                    boxstyle="round,pad=0.03", 
                                    facecolor=colors['security'], 
                                    edgecolor='#7B1FA2',
                                    linewidth=1.5)
    ax.add_patch(security_box3)
    ax.text(7, 4.45, 'PII Redactor', fontsize=9, fontweight='bold', ha='center', color='#7B1FA2')
    ax.text(7, 4.2, '(Data Protection)', fontsize=7, ha='center', color='#616161')
    
    # Sentinel Layer - Top row
    sentinel_y = 2.5
    
    # Pulse Sentinel
    pulse_box = FancyBboxPatch((1.5, 1.5), 2.2, 1.5, 
                                boxstyle="round,pad=0.03", 
                                facecolor=colors['sentinel'], 
                                edgecolor='#2E7D32',
                                linewidth=2)
    ax.add_patch(pulse_box)
    ax.text(2.6, 2.25, 'Pulse', fontsize=11, fontweight='bold', ha='center', color='#2E7D32')
    ax.text(2.6, 1.85, '(Stability)', fontsize=8, ha='center', color='#616161')
    ax.text(2.6, 1.55, 'Priority: 1', fontsize=7, ha='center', color='#757575')
    
    # Janitor Sentinel
    janitor_box = FancyBboxPatch((4.2, 1.5), 2.2, 1.5, 
                                  boxstyle="round,pad=0.03", 
                                  facecolor=colors['sentinel'], 
                                  edgecolor='#2E7D32',
                                  linewidth=2)
    ax.add_patch(janitor_box)
    ax.text(5.3, 2.25, 'Janitor', fontsize=11, fontweight='bold', ha='center', color='#2E7D32')
    ax.text(5.3, 1.85, '(Obstacles)', fontsize=8, ha='center', color='#616161')
    ax.text(5.3, 1.55, 'Priority: 5', fontsize=7, ha='center', color='#757575')
    
    # Vision Sentinel
    vision_box = FancyBboxPatch((7.5, 1.5), 2.2, 1.5, 
                                 boxstyle="round,pad=0.03", 
                                 facecolor=colors['sentinel'], 
                                 edgecolor='#2E7D32',
                                 linewidth=2)
    ax.add_patch(vision_box)
    ax.text(8.6, 2.25, 'Vision', fontsize=11, fontweight='bold', ha='center', color='#2E7D32')
    ax.text(8.6, 1.85, '(AI Detection)', fontsize=8, ha='center', color='#616161')
    ax.text(8.6, 1.55, 'Priority: 7', fontsize=7, ha='center', color='#757575')
    
    # Data Sentinel
    data_box = FancyBboxPatch((10.2, 1.5), 2.2, 1.5, 
                               boxstyle="round,pad=0.03", 
                               facecolor=colors['sentinel'], 
                               edgecolor='#2E7D32',
                               linewidth=2)
    ax.add_patch(data_box)
    ax.text(11.3, 2.25, 'Data', fontsize=11, fontweight='bold', ha='center', color='#2E7D32')
    ax.text(11.3, 1.85, '(Context)', fontsize=8, ha='center', color='#616161')
    ax.text(11.3, 1.55, 'Priority: 3', fontsize=7, ha='center', color='#757575')
    
    # Browser Layer
    browser_box = FancyBboxPatch((1, 0.2), 12, 0.9, 
                                  boxstyle="round,pad=0.03", 
                                  facecolor=colors['browser'], 
                                  edgecolor='#C62828',
                                  linewidth=2)
    ax.add_patch(browser_box)
    ax.text(7, 0.65, 'BROWSER (Playwright) - Controlled by Hub', 
            fontsize=10, fontweight='bold', ha='center', color='#C62828')
    
    # Arrows
    # Intent to Hub
    ax.annotate('', xy=(7, 8), xytext=(2, 8),
                arrowprops=dict(arrowstyle='->', color=colors['arrow'], lw=2))
    ax.text(4.5, 8.15, 'starlight.intent', fontsize=8, ha='center', color='#424242')
    
    # Hub to Sentinels (fan out)
    ax.annotate('', xy=(2.6, 3), xytext=(7, 5.5),
                arrowprops=dict(arrowstyle='->', color=colors['arrow'], lw=1.5))
    ax.annotate('', xy=(5.3, 3), xytext=(7, 5.5),
                arrowprops=dict(arrowstyle='->', color=colors['arrow'], lw=1.5))
    ax.annotate('', xy=(8.6, 3), xytext=(7, 5.5),
                arrowprops=dict(arrowstyle='->', color=colors['arrow'], lw=1.5))
    ax.annotate('', xy=(11.3, 3), xytext=(7, 5.5),
                arrowprops=dict(arrowstyle='->', color=colors['arrow'], lw=1.5))
    
    ax.text(4, 4.2, 'starlight.pre_check', fontsize=7, ha='center', color='#757575')
    
    # Sentinels to Hub (responses)
    ax.annotate('', xy=(7, 5.5), xytext=(2.6, 3),
                arrowprops=dict(arrowstyle='->', color=colors['arrow'], lw=1.5, 
                               connectionstyle='arc3,rad=0.2'))
    ax.annotate('', xy=(7, 5.5), xytext=(5.3, 3),
                arrowprops=dict(arrowstyle='->', color=colors['arrow'], lw=1.5,
                               connectionstyle='arc3,rad=0.2'))
    ax.annotate('', xy=(7, 5.5), xytext=(8.6, 3),
                arrowprops=dict(arrowstyle='->', color=colors['arrow'], lw=1.5,
                               connectionstyle='arc3,rad=-0.2'))
    ax.annotate('', xy=(7, 5.5), xytext=(11.3, 3),
                arrowprops=dict(arrowstyle='->', color=colors['arrow'], lw=1.5,
                               connectionstyle='arc3,rad=-0.2'))
    
    ax.text(4.2, 4.5, 'starlight.clear/wait/hijack', fontsize=6, ha='center', color='#757575')
    
    # Hub to Browser
    ax.annotate('', xy=(7, 1.1), xytext=(7, 4),
                arrowprops=dict(arrowstyle='->', color=colors['arrow'], lw=2))
    ax.text(7.3, 2.5, 'Browser Actions', fontsize=7, ha='left', color='#424242')
    
    # Legend
    legend_elements = [
        mpatches.Patch(facecolor=colors['intent'], edgecolor=colors['border'], label='Intent Layer'),
        mpatches.Patch(facecolor=colors['hub'], edgecolor=colors['border'], label='Hub (Orchestrator)'),
        mpatches.Patch(facecolor=colors['security'], edgecolor='#7B1FA2', label='Security Components'),
        mpatches.Patch(facecolor=colors['sentinel'], edgecolor='#2E7D32', label='Sentinels'),
        mpatches.Patch(facecolor=colors['browser'], edgecolor='#C62828', label='Browser'),
    ]
    ax.legend(handles=legend_elements, loc='upper right', fontsize=8, framealpha=0.9)
    
    # Footer
    ax.text(7, 0.05, 'Starlight Protocol v3.0.3 | WebSocket Transport + JSON-RPC 2.0 Messages', 
            fontsize=8, ha='center', color='#9E9E9E', style='italic')
    
    plt.tight_layout()
    return fig

if __name__ == '__main__':
    fig = create_architecture_diagram()
    
    # Ensure assets directory exists
    import os
    os.makedirs('assets', exist_ok=True)
    
    fig.savefig('assets/architecture.png', dpi=150, bbox_inches='tight', 
                facecolor='white', edgecolor='none')
    print("Architecture diagram saved to assets/architecture.png")
    plt.close()
